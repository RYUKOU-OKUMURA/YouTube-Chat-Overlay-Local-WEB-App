import type { youtube_v3 } from "googleapis";
import { logger } from "@/lib/logger";
import {
  deletionKey,
  isDeletionEventType,
  mapLiveChatMessageDeletion,
  mapRemovalPlaceholderDeletion,
  type LiveChatMessageDeletion
} from "@/server/youtube/deletions";
import { normalizeStreamMessage } from "@/server/youtube/streamParser";
import { firstNonBlankString, isRecord, readString } from "@/server/youtube/internal/values";
import type { ChatMessage } from "@/types";

export function mapLiveChatMessage(item: youtube_v3.Schema$LiveChatMessage): ChatMessage {
  const snippet = item.snippet;
  const snippetRecord = isRecord(snippet) ? snippet : undefined;
  const author = item.authorDetails;
  const superChat = snippet?.superChatDetails;
  const superSticker = snippet?.superStickerDetails;
  const paidDetails = superChat ?? superSticker;
  const superChatUserComment = superChat?.userComment ?? undefined;
  const superStickerAltText = superSticker?.superStickerMetadata?.altText ?? undefined;
  const messageText =
    snippet?.type === "superChatEvent"
      ? firstNonBlankString(superChatUserComment, snippet?.textMessageDetails?.messageText, snippet?.displayMessage)
      : snippet?.type === "superStickerEvent"
        ? firstNonBlankString(snippet?.displayMessage, superStickerAltText)
        : resolvePlainTextMessage(snippet);
  const id = item.id ?? crypto.randomUUID();
  return {
    id,
    platformMessageId: id,
    authorName: author?.displayName ?? "Unknown",
    authorImageUrl: author?.profileImageUrl ?? undefined,
    authorChannelId:
      author?.channelId ??
      readString(snippetRecord?.authorChannelId) ??
      readString(snippetRecord?.author_channel_id) ??
      undefined,
    messageText: messageText ?? "",
    messageType: snippet?.type ?? "textMessageEvent",
    isMember: Boolean(author?.isChatSponsor),
    isModerator: Boolean(author?.isChatModerator),
    isOwner: Boolean(author?.isChatOwner),
    isSuperChat: Boolean(paidDetails) || snippet?.type === "superStickerEvent",
    amountText: paidDetails?.amountDisplayString ?? undefined,
    publishedAt: snippet?.publishedAt ?? new Date().toISOString()
  };
}

export function mapLiveChatStreamItems(items: youtube_v3.Schema$LiveChatMessage[]) {
  const messages: ChatMessage[] = [];
  const deletions: LiveChatMessageDeletion[] = [];

  for (const item of items) {
    const deletion = mapLiveChatMessageDeletion(item);
    if (deletion) {
      deletions.push(deletion);
      continue;
    }
    if (isDeletionEventType(item.snippet?.type)) {
      logger.warn(
        { type: item.snippet?.type, itemId: item.id },
        "YouTube live chat deletion event could not be mapped to a target message id."
      );
      continue;
    }
    messages.push(mapLiveChatMessage(item));
  }

  return { messages, deletions };
}

/**
 * Extracts deletion/retraction signals from a liveChatMessages.list snapshot.
 * The stream endpoint never pushes retractions for an ongoing connection, so the
 * recent-history window is the only place placeholders and tombstones show up.
 */
export function collectDeletionEventsFromListItems(rawItems: unknown[]): LiveChatMessageDeletion[] {
  const items = rawItems.map((item) => normalizeStreamMessage(item));
  const { messages, deletions } = mapLiveChatStreamItems(items);
  const placeholderDeletions = messages
    .map((message) => mapRemovalPlaceholderDeletion(message))
    .filter((deletion): deletion is LiveChatMessageDeletion => deletion !== null);

  const merged = new Map<string, LiveChatMessageDeletion>();
  for (const deletion of [...deletions, ...placeholderDeletions]) {
    const key = deletionKey(deletion);
    if (key) {
      merged.set(key, deletion);
    }
  }
  return [...merged.values()];
}

function containsUnicodeEmoji(messageText: string) {
  return /[\p{Extended_Pictographic}]/u.test(messageText);
}

function isYouTubeEmojiShortcodeDisplay(messageText: string) {
  const normalized = messageText.trim();
  if (!normalized || containsUnicodeEmoji(normalized)) {
    return false;
  }
  return /(:[a-z0-9_]+:|\b[a-z]+_[a-z0-9_]+\b)/i.test(normalized);
}

function resolvePlainTextMessage(snippet: youtube_v3.Schema$LiveChatMessage["snippet"]) {
  const textMessage = snippet?.textMessageDetails?.messageText?.trim();
  const displayMessage = snippet?.displayMessage?.trim();

  if (textMessage && displayMessage && isYouTubeEmojiShortcodeDisplay(displayMessage)) {
    return textMessage;
  }
  if (textMessage && displayMessage && containsUnicodeEmoji(textMessage) && !containsUnicodeEmoji(displayMessage)) {
    return textMessage;
  }
  return firstNonBlankString(snippet?.textMessageDetails?.messageText, snippet?.displayMessage) ?? "";
}
