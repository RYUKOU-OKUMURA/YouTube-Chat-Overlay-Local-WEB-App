import type { Readable } from "node:stream";
import { google, youtube_v3 } from "googleapis";
import { getAuthorizedClient } from "@/server/youtube/oauth";
import type { ChatMessage } from "@/types";

export type LiveChatInfo = {
  videoId: string;
  liveChatId: string;
  streamTitle?: string;
  channelName?: string;
};

export type LiveChatStreamBatch = {
  messages: ChatMessage[];
  nextPageToken?: string;
  offlineAt?: string;
};

export type StreamLiveChatMessagesInput = {
  liveChatId: string;
  pageToken?: string;
  signal?: AbortSignal;
  profileImageSize?: number;
};

export type YouTubeApiErrorKind =
  | "quotaExceeded"
  | "rateLimitExceeded"
  | "liveChatEnded"
  | "liveChatDisabled"
  | "liveChatNotFound"
  | "unauthorized"
  | "network"
  | "unknown";

export type ClassifiedYouTubeError = {
  kind: YouTubeApiErrorKind;
  message: string;
  retryable: boolean;
};

export async function getLiveChatInfo(videoId: string): Promise<LiveChatInfo> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.videos.list({
    part: ["snippet", "liveStreamingDetails"],
    id: [videoId]
  });
  const item = response.data.items?.[0];
  const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId) {
    throw new Error("activeLiveChatId was not found. The stream may be offline or chat may be disabled.");
  }
  return {
    videoId,
    liveChatId,
    streamTitle: item.snippet?.title ?? undefined,
    channelName: item.snippet?.channelTitle ?? undefined
  };
}

export async function* streamLiveChatMessages({
  liveChatId,
  pageToken,
  signal,
  profileImageSize = 88
}: StreamLiveChatMessagesInput): AsyncGenerator<LiveChatStreamBatch> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.youtube.v3.liveChat.messages.stream(
    {
      liveChatId,
      part: ["id", "snippet", "authorDetails"],
      pageToken,
      maxResults: 200,
      profileImageSize
    },
    {
      responseType: "stream",
      signal
    }
  );

  for await (const item of parseLiveChatStreamResponses(response.data)) {
    const normalized = normalizeStreamResponse(item);
    yield {
      messages: (normalized.items ?? []).map(mapLiveChatMessage),
      nextPageToken: normalized.nextPageToken ?? undefined,
      offlineAt: normalized.offlineAt ?? undefined
    };
  }
}

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

  push(chunk: Buffer | string | Uint8Array) {
    this.buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return this.drain(false);
  }

  flush() {
    return this.drain(true);
  }

  private drain(flush: boolean) {
    const values: unknown[] = [];

    while (true) {
      this.buffer = stripJsonStreamPrefix(this.buffer.trimStart());
      if (!this.buffer) {
        return values;
      }

      const end = findCompleteJsonObjectEnd(this.buffer);
      if (end === null) {
        if (flush) {
          throw new Error("YouTube stream returned incomplete or invalid JSON.");
        }
        return values;
      }

      const raw = this.buffer.slice(0, end + 1);
      values.push(JSON.parse(raw));
      this.buffer = this.buffer.slice(end + 1);
    }
  }
}

export function classifyYouTubeError(error: unknown): ClassifiedYouTubeError {
  if (isAbortError(error)) {
    return {
      kind: "network",
      message: "YouTube stream connection was aborted.",
      retryable: false
    };
  }

  const reason = extractYouTubeErrorReason(error);
  const message = getYouTubeErrorMessage(error);

  if (reason === "quotaExceeded") {
    return {
      kind: "quotaExceeded",
      message: "YouTube API quota has been exceeded. Wait for the daily reset or increase the quota in Google Cloud Console.",
      retryable: false
    };
  }
  if (reason === "rateLimitExceeded") {
    return {
      kind: "rateLimitExceeded",
      message: "YouTube live chat requests are being sent too quickly. Comment streaming has been stopped.",
      retryable: false
    };
  }
  if (reason === "liveChatEnded" || message.toLowerCase().includes("live chat ended")) {
    return {
      kind: "liveChatEnded",
      message: "The YouTube live chat has ended.",
      retryable: false
    };
  }
  if (reason === "liveChatDisabled") {
    return {
      kind: "liveChatDisabled",
      message: "Live chat is disabled for this broadcast.",
      retryable: false
    };
  }
  if (reason === "liveChatNotFound") {
    return {
      kind: "liveChatNotFound",
      message: "The YouTube live chat could not be found.",
      retryable: false
    };
  }
  if (reason === "authorizationRequired" || reason === "insufficientPermissions" || getErrorStatus(error) === 401) {
    return {
      kind: "unauthorized",
      message: "YouTube authorization is invalid or expired. Reconnect YouTube OAuth.",
      retryable: false
    };
  }
  if (isNetworkLikeError(error)) {
    return {
      kind: "network",
      message: "YouTube stream connection was interrupted. Reconnecting...",
      retryable: true
    };
  }

  return {
    kind: "unknown",
    message,
    retryable: false
  };
}

export function mapLiveChatMessage(item: youtube_v3.Schema$LiveChatMessage): ChatMessage {
  const snippet = item.snippet;
  const author = item.authorDetails;
  const superChat = snippet?.superChatDetails;
  const id = item.id ?? crypto.randomUUID();
  return {
    id,
    platformMessageId: id,
    authorName: author?.displayName ?? "Unknown",
    authorImageUrl: author?.profileImageUrl ?? undefined,
    authorChannelId: author?.channelId ?? undefined,
    messageText: snippet?.displayMessage ?? "",
    messageType: snippet?.type ?? "textMessageEvent",
    isMember: Boolean(author?.isChatSponsor),
    isModerator: Boolean(author?.isChatModerator),
    isOwner: Boolean(author?.isChatOwner),
    isSuperChat: Boolean(superChat),
    amountText: superChat?.amountDisplayString ?? undefined,
    publishedAt: snippet?.publishedAt ?? new Date().toISOString()
  };
}

function normalizeStreamResponse(value: unknown): youtube_v3.Schema$LiveChatMessageListResponse {
  if (!isRecord(value)) {
    throw new Error("YouTube stream returned a non-object response.");
  }

  return {
    ...value,
    nextPageToken: readString(value.nextPageToken) ?? readString(value.next_page_token) ?? undefined,
    offlineAt: readString(value.offlineAt) ?? readString(value.offline_at) ?? undefined,
    items: Array.isArray(value.items) ? value.items.map(normalizeStreamMessage) : undefined
  } as youtube_v3.Schema$LiveChatMessageListResponse;
}

function normalizeStreamMessage(value: unknown): youtube_v3.Schema$LiveChatMessage {
  if (!isRecord(value)) {
    return {};
  }
  const snippet = isRecord(value.snippet) ? value.snippet : undefined;
  const author = isRecord(value.authorDetails)
    ? value.authorDetails
    : isRecord(value.author_details)
      ? value.author_details
      : undefined;
  const superChat = isRecord(snippet?.superChatDetails)
    ? snippet?.superChatDetails
    : isRecord(snippet?.super_chat_details)
      ? snippet?.super_chat_details
      : undefined;

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
          superChatDetails: superChat
            ? {
                ...superChat,
                amountDisplayString:
                  readString(superChat.amountDisplayString) ?? readString(superChat.amount_display_string) ?? undefined
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

function extractYouTubeErrorReason(error: unknown) {
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  if (isRecord(data) && isRecord(data.error)) {
    const errors = data.error.errors;
    const first = Array.isArray(errors) && isRecord(errors[0]) ? errors[0] : undefined;
    return readString(first?.reason) ?? readString(data.error.reason);
  }
  const errors = isRecord(error) ? error.errors : undefined;
  const first = Array.isArray(errors) && isRecord(errors[0]) ? errors[0] : undefined;
  return readString(first?.reason);
}

function getYouTubeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  if (isRecord(data) && isRecord(data.error)) {
    return readString(data.error.message) ?? "YouTube API request failed.";
  }
  return "YouTube API request failed.";
}

function getErrorStatus(error: unknown) {
  const status = isRecord(error) && isRecord(error.response) ? error.response.status : undefined;
  return typeof status === "number" ? status : undefined;
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
}

function isNetworkLikeError(error: unknown) {
  if (error instanceof Error) {
    const text = `${error.name} ${error.message}`.toLowerCase();
    return text.includes("network") || text.includes("socket") || text.includes("stream") || text.includes("fetch failed");
  }
  return false;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
