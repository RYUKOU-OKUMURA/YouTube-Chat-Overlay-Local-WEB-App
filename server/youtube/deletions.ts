import type { youtube_v3 } from "googleapis";
import {
  isYoutubeSystemDeletedMessage,
  isYoutubeSystemRetractedMessage
} from "@/lib/youtubeSystemMessages";
import type { ChatMessage } from "@/types";

type LiveChatMessageDeletionBase = {
  deletionStatus: NonNullable<ChatMessage["deletionStatus"]>;
  deletedAt: string;
  /** Author retract placeholders: match the latest message from the author at or before this time. */
  authorRetractionAnchor?: string;
};

export type LiveChatMessageDeletion = LiveChatMessageDeletionBase &
  (
    | { targetPlatformMessageId: string; targetAuthorChannelId?: never; authorRetractionAnchor?: never }
    | { targetPlatformMessageId?: never; targetAuthorChannelId: string; authorRetractionAnchor?: string }
  );

export type DeletionRecord = {
  deletionStatus: NonNullable<ChatMessage["deletionStatus"]>;
  deletedAt: string;
};

type AuthorTimelineEntry = {
  platformMessageId: string;
  publishedAt: string;
};

const maxDeletionRegistryEntries = 2000;
const maxAuthorTimelineEntriesPerAuthor = 50;
const maxAuthorTimelineEntriesTotal = 5000;
const defaultListPollingIntervalMs = 5000;
const minDeletionReconcileIntervalMs = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
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

export function deletionStatusText(status: NonNullable<ChatMessage["deletionStatus"]>) {
  return status === "retracted"
    ? "このコメントは投稿者により取り消されました。"
    : "このコメントは削除されました。";
}

/** Unified key for merge maps and pending deletion queues. */
export function deletionKey(deletion: LiveChatMessageDeletion) {
  if (deletion.targetPlatformMessageId) {
    return `msg:${deletion.targetPlatformMessageId}`;
  }
  if (deletion.targetAuthorChannelId && deletion.authorRetractionAnchor) {
    return `anchor:${deletion.targetAuthorChannelId}:${deletion.authorRetractionAnchor}`;
  }
  if (deletion.targetAuthorChannelId) {
    return `author:${deletion.targetAuthorChannelId}`;
  }
  return undefined;
}

export function isDeletionEventType(type: string | null | undefined) {
  return (
    type === "messageDeletedEvent" ||
    type === "messageRetractedEvent" ||
    type === "tombstone" ||
    type === "userBannedEvent"
  );
}

function tombstoneTargetMessageId(item: youtube_v3.Schema$LiveChatMessage) {
  const snippet = isRecord(item.snippet) ? item.snippet : undefined;
  const tombstoneDetails = readRecordField(snippet, "tombstoneDetails", "tombstone_details");

  return (
    readTargetMessageId(tombstoneDetails) ??
    readTargetMessageId(snippet) ??
    readString(item.id) ??
    undefined
  );
}

function deletedMessageTargetMessageId(item: youtube_v3.Schema$LiveChatMessage) {
  const snippet = isRecord(item.snippet) ? item.snippet : undefined;
  const messageDeletedDetails = readRecordField(snippet, "messageDeletedDetails", "message_deleted_details");

  return readTargetMessageId(messageDeletedDetails) ?? undefined;
}

function retractionTargetMessageId(item: youtube_v3.Schema$LiveChatMessage) {
  const snippet = isRecord(item.snippet) ? item.snippet : undefined;
  const messageRetractedDetails = readRecordField(snippet, "messageRetractedDetails", "message_retracted_details");

  return readTargetMessageId(messageRetractedDetails) ?? undefined;
}

function bannedAuthorChannelId(item: youtube_v3.Schema$LiveChatMessage) {
  const snippet = isRecord(item.snippet) ? item.snippet : undefined;
  const userBannedDetails = readRecordField(snippet, "userBannedDetails", "user_banned_details");
  const bannedUserDetails = readRecordField(userBannedDetails, "bannedUserDetails", "banned_user_details");

  return (
    readString(bannedUserDetails?.channelId) ??
    readString(bannedUserDetails?.channel_id) ??
    undefined
  );
}

export function mapLiveChatMessageDeletion(item: youtube_v3.Schema$LiveChatMessage): LiveChatMessageDeletion | null {
  const snippet = item.snippet;
  if (!snippet) {
    return null;
  }
  const type = snippet?.type;
  if (type === "messageDeletedEvent" || type === "tombstone") {
    const targetPlatformMessageId =
      type === "tombstone"
        ? snippet.messageDeletedDetails?.deletedMessageId ?? tombstoneTargetMessageId(item)
        : deletedMessageTargetMessageId(item);
    if (targetPlatformMessageId) {
      return {
        targetPlatformMessageId,
        deletionStatus: "deleted",
        deletedAt: snippet.publishedAt ?? new Date().toISOString()
      };
    }
    // Fallback: When targetPlatformMessageId is missing (e.g., self-deletions), use author-anchor resolution.
    const targetAuthorChannelId = item.authorDetails?.channelId ?? snippet.authorChannelId ?? undefined;
    if (targetAuthorChannelId) {
      return {
        targetAuthorChannelId,
        authorRetractionAnchor: snippet.publishedAt ?? undefined,
        deletionStatus: "deleted",
        deletedAt: snippet.publishedAt ?? new Date().toISOString()
      };
    }
    return null;
  }

  if (type === "messageRetractedEvent") {
    const targetPlatformMessageId = retractionTargetMessageId(item);
    if (targetPlatformMessageId) {
      return {
        targetPlatformMessageId,
        deletionStatus: "retracted",
        deletedAt: snippet.publishedAt ?? new Date().toISOString()
      };
    }
    // Fallback: When targetPlatformMessageId is missing (e.g., self-retractions), use author-anchor resolution.
    const targetAuthorChannelId = item.authorDetails?.channelId ?? snippet.authorChannelId ?? undefined;
    if (targetAuthorChannelId) {
      return {
        targetAuthorChannelId,
        authorRetractionAnchor: snippet.publishedAt ?? undefined,
        deletionStatus: "retracted",
        deletedAt: snippet.publishedAt ?? new Date().toISOString()
      };
    }
    return null;
  }

  if (type === "userBannedEvent") {
    // Overlay policy: mark all retained messages from the banned author as deleted.
    // YouTube only emits a ban event; it does not guarantee retroactive log removal.
    const targetAuthorChannelId = bannedAuthorChannelId(item);
    return targetAuthorChannelId
      ? {
          targetAuthorChannelId,
          deletionStatus: "deleted",
          deletedAt: snippet.publishedAt ?? new Date().toISOString()
        }
      : null;
  }

  return null;
}

export function mapRemovalPlaceholderDeletion(message: ChatMessage): LiveChatMessageDeletion | null {
  if (isYoutubeSystemRetractedMessage(message.messageText)) {
    if (!message.authorChannelId) {
      return null;
    }
    return {
      targetAuthorChannelId: message.authorChannelId,
      authorRetractionAnchor: message.publishedAt,
      deletionStatus: "retracted",
      deletedAt: message.publishedAt
    };
  }
  if (isYoutubeSystemDeletedMessage(message.messageText)) {
    if (!message.authorChannelId) {
      return null;
    }
    return {
      targetAuthorChannelId: message.authorChannelId,
      authorRetractionAnchor: message.publishedAt,
      deletionStatus: "deleted",
      deletedAt: message.publishedAt
    };
  }
  return null;
}

export function findStoredMessage(
  messages: ChatMessage[],
  superChats: ChatMessage[],
  platformMessageId: string
) {
  return (
    messages.find((message) => message.platformMessageId === platformMessageId) ??
    superChats.find((message) => message.platformMessageId === platformMessageId)
  );
}

export function collectAuthorRetractionCandidates(
  messages: ChatMessage[],
  superChats: ChatMessage[],
  authorChannelId: string,
  anchorPublishedAt: string,
  timeline?: AuthorTimelineEntry[]
) {
  const anchorMs = Date.parse(anchorPublishedAt);
  if (Number.isNaN(anchorMs)) {
    return [];
  }

  const fromMessages = [...messages, ...superChats].filter((message) => {
    if (message.authorChannelId !== authorChannelId || message.deletionStatus) {
      return false;
    }
    const text = message.messageText.trim();
    if (!text || isYoutubeSystemRetractedMessage(text) || isYoutubeSystemDeletedMessage(text)) {
      return false;
    }
    const publishedMs = Date.parse(message.publishedAt);
    return !Number.isNaN(publishedMs) && publishedMs <= anchorMs;
  });

  const fromTimeline = (timeline ?? []).filter((entry) => {
    const publishedMs = Date.parse(entry.publishedAt);
    return !Number.isNaN(publishedMs) && publishedMs <= anchorMs;
  });

  const candidateIds = new Set<string>();
  const candidates: Array<{ platformMessageId: string; publishedAt: string }> = [];

  for (const message of fromMessages) {
    if (!candidateIds.has(message.platformMessageId)) {
      candidateIds.add(message.platformMessageId);
      candidates.push({
        platformMessageId: message.platformMessageId,
        publishedAt: message.publishedAt
      });
    }
  }

  for (const entry of fromTimeline) {
    if (!candidateIds.has(entry.platformMessageId)) {
      candidateIds.add(entry.platformMessageId);
      candidates.push(entry);
    }
  }

  candidates.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  return candidates;
}

/** Resolves author-anchor retractions to the newest message at or before the anchor (including within 2s ambiguity). */
export function findAuthorRetractionTarget(
  messages: ChatMessage[],
  superChats: ChatMessage[],
  authorChannelId: string,
  anchorPublishedAt: string,
  timeline?: AuthorTimelineEntry[]
) {
  const candidates = collectAuthorRetractionCandidates(
    messages,
    superChats,
    authorChannelId,
    anchorPublishedAt,
    timeline
  );
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates[0]?.platformMessageId;
}

export function resolveDeletionTarget(
  deletion: LiveChatMessageDeletion,
  messages: ChatMessage[],
  superChats: ChatMessage[],
  timeline?: AuthorTimelineEntry[]
): LiveChatMessageDeletion {
  if (deletion.targetPlatformMessageId) {
    const stored = findStoredMessage(messages, superChats, deletion.targetPlatformMessageId);
    if (stored && isYoutubeSystemRetractedMessage(stored.messageText) && stored.authorChannelId) {
      const originalId = findAuthorRetractionTarget(
        messages,
        superChats,
        stored.authorChannelId,
        stored.publishedAt,
        timeline
      );
      if (originalId) {
        return {
          targetPlatformMessageId: originalId,
          deletionStatus: deletion.deletionStatus,
          deletedAt: deletion.deletedAt
        };
      }
    }
    return deletion;
  }

  if (deletion.targetAuthorChannelId && deletion.authorRetractionAnchor) {
    const originalId = findAuthorRetractionTarget(
      messages,
      superChats,
      deletion.targetAuthorChannelId,
      deletion.authorRetractionAnchor,
      timeline
    );
    if (originalId) {
      return {
        targetPlatformMessageId: originalId,
        deletionStatus: deletion.deletionStatus,
        deletedAt: deletion.deletedAt
      };
    }
  }

  return deletion;
}

export function deletionMatchesMessage(
  deletion: LiveChatMessageDeletion,
  message: ChatMessage,
  messages: ChatMessage[],
  superChats: ChatMessage[],
  timeline?: AuthorTimelineEntry[]
) {
  if (deletion.targetPlatformMessageId) {
    return message.platformMessageId === deletion.targetPlatformMessageId;
  }
  if (deletion.targetAuthorChannelId && deletion.authorRetractionAnchor) {
    const targetId = findAuthorRetractionTarget(
      messages,
      superChats,
      deletion.targetAuthorChannelId,
      deletion.authorRetractionAnchor,
      timeline
    );
    return targetId !== undefined && message.platformMessageId === targetId;
  }
  if (deletion.targetAuthorChannelId) {
    return message.authorChannelId === deletion.targetAuthorChannelId;
  }
  return false;
}

export function isResolvableDeletion(
  deletion: LiveChatMessageDeletion,
  messages: ChatMessage[],
  superChats: ChatMessage[],
  timeline?: AuthorTimelineEntry[]
) {
  const resolved = resolveDeletionTarget(deletion, messages, superChats, timeline);
  return Boolean(resolved.targetPlatformMessageId);
}

export function readPollingIntervalMillis(response: {
  pollingIntervalMillis?: number | null;
  polling_interval_millis?: number | null;
}) {
  const value = response.pollingIntervalMillis ?? response.polling_interval_millis;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(value, minDeletionReconcileIntervalMs);
  }
  return defaultListPollingIntervalMs;
}

export class DeletionRegistry {
  private platformDeletions = new Map<string, DeletionRecord>();
  private platformDeletionQueue: string[] = [];
  private authorTimeline = new Map<string, AuthorTimelineEntry[]>();
  private authorTimelineTotal = 0;

  clear() {
    this.platformDeletions.clear();
    this.platformDeletionQueue = [];
    this.authorTimeline.clear();
    this.authorTimelineTotal = 0;
  }

  rememberAuthorMessage(authorChannelId: string | undefined, platformMessageId: string, publishedAt: string) {
    if (!authorChannelId) {
      return;
    }
    const entries = this.authorTimeline.get(authorChannelId) ?? [];
    if (entries.some((entry) => entry.platformMessageId === platformMessageId)) {
      return;
    }
    entries.unshift({ platformMessageId, publishedAt });
    while (entries.length > maxAuthorTimelineEntriesPerAuthor) {
      const removed = entries.pop();
      if (removed) {
        this.authorTimelineTotal -= 1;
      }
    }
    this.authorTimeline.set(authorChannelId, entries);
    this.authorTimelineTotal += 1;
    this.trimAuthorTimelineTotal();
  }

  getTimelineForAuthor(authorChannelId: string) {
    return this.authorTimeline.get(authorChannelId);
  }

  recordPlatformDeletion(platformMessageId: string, record: DeletionRecord) {
    if (this.platformDeletions.has(platformMessageId)) {
      this.platformDeletions.set(platformMessageId, record);
      return;
    }
    this.platformDeletions.set(platformMessageId, record);
    this.platformDeletionQueue.push(platformMessageId);
    while (this.platformDeletionQueue.length > maxDeletionRegistryEntries) {
      const expired = this.platformDeletionQueue.shift();
      if (expired) {
        this.platformDeletions.delete(expired);
      }
    }
  }

  getPlatformDeletion(platformMessageId: string) {
    return this.platformDeletions.get(platformMessageId);
  }

  findAuthorRetractionTarget(authorChannelId: string, anchorPublishedAt: string) {
    const timeline = this.authorTimeline.get(authorChannelId);
    const candidates = collectAuthorRetractionCandidates([], [], authorChannelId, anchorPublishedAt, timeline);
    return candidates[0]?.platformMessageId;
  }

  private trimAuthorTimelineTotal() {
    while (this.authorTimelineTotal > maxAuthorTimelineEntriesTotal) {
      let removed = false;
      for (const [authorChannelId, entries] of this.authorTimeline) {
        if (entries.length === 0) {
          this.authorTimeline.delete(authorChannelId);
          continue;
        }
        entries.pop();
        this.authorTimelineTotal -= 1;
        removed = true;
        if (entries.length === 0) {
          this.authorTimeline.delete(authorChannelId);
        }
        break;
      }
      if (!removed) {
        break;
      }
    }
  }
}
