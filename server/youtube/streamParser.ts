import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";
import type { youtube_v3 } from "googleapis";
import {
  YouTubeStreamParserError,
  YouTubeStreamResponseShapeError,
  YouTubeStreamTruncatedError
} from "@/server/youtube/errors";
import { isRecord, readBoolean, readString } from "@/server/youtube/internal/values";

export async function* parseLiveChatStreamResponses(
  stream: AsyncIterable<Buffer | string | Uint8Array> | Readable
): AsyncGenerator<youtube_v3.Schema$LiveChatMessageListResponse> {
  const parser = new JsonObjectStreamParser();
  for await (const chunk of stream) {
    for (const value of parser.push(chunk)) {
      yield normalizeStreamResponse(value);
    }
  }
  for (const value of parser.flush()) {
    yield normalizeStreamResponse(value);
  }
}

export class JsonObjectStreamParser {
  private buffer = "";
  private decoder = new TextDecoder("utf-8");
  private inTopLevelArray = false;

  push(chunk: Buffer | string | Uint8Array) {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  flush() {
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  private drain(flush: boolean) {
    const values: unknown[] = [];

    while (true) {
      this.buffer = stripJsonStreamPrefix(this.buffer.trimStart());
      if (!this.buffer) {
        return values;
      }

      if (this.inTopLevelArray) {
        if (this.buffer.startsWith(",")) {
          this.buffer = this.buffer.slice(1);
          continue;
        }
        if (this.buffer.startsWith("]")) {
          this.buffer = this.buffer.slice(1);
          this.inTopLevelArray = false;
          continue;
        }
        if (!this.buffer.startsWith("{")) {
          if (flush) {
            throw new YouTubeStreamParserError(
              "YouTubeライブチャットのJSON配列を解析できませんでした。",
              "unexpected_stream_json_token"
            );
          }
          return values;
        }
      } else if (this.buffer.startsWith("[")) {
        this.inTopLevelArray = true;
        this.buffer = this.buffer.slice(1);
        continue;
      } else if (!this.buffer.startsWith("{")) {
        if (flush) {
          throw new YouTubeStreamParserError(
            "YouTubeライブチャットのJSON応答を解析できませんでした。",
            "unexpected_stream_json_token"
          );
        }
        return values;
      }

      const end = findCompleteJsonObjectEnd(this.buffer);
      if (end === null) {
        if (flush) {
          throw new YouTubeStreamTruncatedError(
            "YouTubeライブチャットのJSON応答が途中で終了しました。",
            "incomplete_stream_json"
          );
        }
        return values;
      }

      const raw = this.buffer.slice(0, end + 1);
      try {
        values.push(JSON.parse(raw));
      } catch {
        throw new YouTubeStreamParserError(
          "YouTubeライブチャットのJSON応答を解析できませんでした。",
          "invalid_stream_json"
        );
      }
      this.buffer = this.buffer.slice(end + 1);
    }
  }
}

export function normalizeStreamResponse(value: unknown): youtube_v3.Schema$LiveChatMessageListResponse {
  if (!isRecord(value)) {
    throw new YouTubeStreamResponseShapeError(
      "YouTubeライブチャットの応答がオブジェクトではありません。",
      "stream_response_not_object"
    );
  }
  if ("items" in value && !Array.isArray(value.items)) {
    throw new YouTubeStreamResponseShapeError(
      "YouTubeライブチャットのメッセージ一覧が配列ではありません。",
      "stream_items_not_array"
    );
  }

  const pollingIntervalMillis =
    typeof value.pollingIntervalMillis === "number"
      ? value.pollingIntervalMillis
      : typeof value.polling_interval_millis === "number"
        ? value.polling_interval_millis
        : undefined;

  return {
    ...value,
    nextPageToken: readString(value.nextPageToken) ?? readString(value.next_page_token) ?? undefined,
    offlineAt: readString(value.offlineAt) ?? readString(value.offline_at) ?? undefined,
    pollingIntervalMillis,
    items: Array.isArray(value.items) ? value.items.map(normalizeStreamMessage) : undefined
  } as youtube_v3.Schema$LiveChatMessageListResponse;
}

export function normalizeStreamMessage(value: unknown): youtube_v3.Schema$LiveChatMessage {
  if (!isRecord(value)) {
    return {};
  }
  const snippet = readRecordField(value, "snippet");
  const author = readRecordField(value, "authorDetails", "author_details");
  const superChat = readRecordField(snippet, "superChatDetails", "super_chat_details");
  const superSticker = readRecordField(snippet, "superStickerDetails", "super_sticker_details");
  const messageDeleted = readRecordField(snippet, "messageDeletedDetails", "message_deleted_details");
  const messageRetracted = readRecordField(snippet, "messageRetractedDetails", "message_retracted_details");
  const textMessageDetails = readRecordField(snippet, "textMessageDetails", "text_message_details");
  const tombstoneDetails = readRecordField(snippet, "tombstoneDetails", "tombstone_details");
  const userBannedDetails = readRecordField(snippet, "userBannedDetails", "user_banned_details");
  const bannedUserDetails = readRecordField(userBannedDetails, "bannedUserDetails", "banned_user_details");
  const superStickerMetadata = readRecordField(superSticker, "superStickerMetadata", "super_sticker_metadata");

  return {
    ...value,
    authorDetails: author
      ? {
          ...author,
          channelId: readString(author.channelId) ?? readString(author.channel_id) ?? undefined,
          displayName: readString(author.displayName) ?? readString(author.display_name) ?? undefined,
          profileImageUrl: readString(author.profileImageUrl) ?? readString(author.profile_image_url) ?? undefined,
          isChatSponsor: readBoolean(author.isChatSponsor) ?? readBoolean(author.is_chat_sponsor) ?? undefined,
          isChatModerator: readBoolean(author.isChatModerator) ?? readBoolean(author.is_chat_moderator) ?? undefined,
          isChatOwner: readBoolean(author.isChatOwner) ?? readBoolean(author.is_chat_owner) ?? undefined
        }
      : undefined,
    snippet: snippet
      ? {
          ...snippet,
          displayMessage: readString(snippet.displayMessage) ?? readString(snippet.display_message) ?? undefined,
          publishedAt: readString(snippet.publishedAt) ?? readString(snippet.published_at) ?? undefined,
          type: readString(snippet.type) ?? undefined,
          hasDisplayContent:
            readBoolean(snippet.hasDisplayContent) ?? readBoolean(snippet.has_display_content) ?? undefined,
          textMessageDetails: textMessageDetails
            ? {
                ...textMessageDetails,
                messageText:
                  readString(textMessageDetails.messageText) ?? readString(textMessageDetails.message_text) ?? undefined
              }
            : undefined,
          messageDeletedDetails: messageDeleted
            ? {
                ...messageDeleted,
                deletedMessageId:
                  readString(messageDeleted.deletedMessageId) ?? readString(messageDeleted.deleted_message_id) ?? undefined
              }
            : undefined,
          messageRetractedDetails: messageRetracted
            ? {
                ...messageRetracted,
                retractedMessageId:
                  readString(messageRetracted.retractedMessageId) ?? readString(messageRetracted.retracted_message_id) ?? undefined
              }
            : undefined,
          tombstoneDetails: tombstoneDetails
            ? {
                ...tombstoneDetails,
                targetMessageId: readTargetMessageId(tombstoneDetails) ?? undefined
              }
            : undefined,
          userBannedDetails: userBannedDetails
            ? {
                ...userBannedDetails,
                banType: readString(userBannedDetails.banType) ?? readString(userBannedDetails.ban_type) ?? undefined,
                banDurationSeconds:
                  readString(userBannedDetails.banDurationSeconds) ??
                  readString(userBannedDetails.ban_duration_seconds) ??
                  undefined,
                bannedUserDetails: bannedUserDetails
                  ? {
                      ...bannedUserDetails,
                      channelId:
                        readString(bannedUserDetails.channelId) ?? readString(bannedUserDetails.channel_id) ?? undefined,
                      displayName:
                        readString(bannedUserDetails.displayName) ?? readString(bannedUserDetails.display_name) ?? undefined,
                      profileImageUrl:
                        readString(bannedUserDetails.profileImageUrl) ??
                        readString(bannedUserDetails.profile_image_url) ??
                        undefined,
                      channelUrl:
                        readString(bannedUserDetails.channelUrl) ?? readString(bannedUserDetails.channel_url) ?? undefined
                    }
                  : undefined
              }
            : undefined,
          superChatDetails: superChat
            ? {
                ...superChat,
                amountDisplayString:
                  readString(superChat.amountDisplayString) ?? readString(superChat.amount_display_string) ?? undefined,
                userComment: readString(superChat.userComment) ?? readString(superChat.user_comment) ?? undefined
              }
            : undefined,
          superStickerDetails: superSticker
            ? {
                ...superSticker,
                amountDisplayString:
                  readString(superSticker.amountDisplayString) ?? readString(superSticker.amount_display_string) ?? undefined,
                superStickerMetadata: superStickerMetadata
                  ? {
                      ...superStickerMetadata,
                      altText: readString(superStickerMetadata.altText) ?? readString(superStickerMetadata.alt_text) ?? undefined,
                      altTextLanguage:
                        readString(superStickerMetadata.altTextLanguage) ??
                        readString(superStickerMetadata.alt_text_language) ??
                        undefined,
                      stickerId: readString(superStickerMetadata.stickerId) ?? readString(superStickerMetadata.sticker_id) ?? undefined
                    }
                  : undefined
              }
            : undefined
        }
      : undefined
  } as youtube_v3.Schema$LiveChatMessage;
}

function findCompleteJsonObjectEnd(input: string) {
  if (!input.startsWith("{")) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function stripJsonStreamPrefix(input: string) {
  return input.startsWith(")]}'") ? input.slice(4).trimStart() : input;
}

function readRecordField(source: Record<string, unknown> | undefined, key: string, fallbackKey?: string) {
  const primary = source?.[key];
  if (isRecord(primary)) {
    return primary;
  }
  const fallback = fallbackKey ? source?.[fallbackKey] : undefined;
  return isRecord(fallback) ? fallback : undefined;
}

function readTargetMessageId(source: Record<string, unknown> | undefined) {
  return (
    readString(source?.targetMessageId) ??
    readString(source?.target_message_id) ??
    readString(source?.deletedMessageId) ??
    readString(source?.deleted_message_id) ??
    readString(source?.retractedMessageId) ??
    readString(source?.retracted_message_id)
  );
}
