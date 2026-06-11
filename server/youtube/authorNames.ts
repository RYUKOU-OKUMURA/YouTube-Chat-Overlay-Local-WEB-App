import type { youtube_v3 } from "googleapis";
import { logger } from "@/lib/logger";
import { firstNonBlankString } from "@/server/youtube/internal/values";
import type { ChatMessage } from "@/types";

type ChannelTitleCacheEntry = {
  title: string | null;
  expiresAt: number;
};

const maxChannelTitleLookupIds = 50;
const channelTitleCacheTtlMs = 24 * 60 * 60 * 1000;
const missingChannelTitleCacheTtlMs = 10 * 60 * 1000;
const maxChannelTitleCacheEntries = 5000;
const channelTitleCache = new Map<string, ChannelTitleCacheEntry>();

export async function resolveLiveChatAuthorNames(
  messages: ChatMessage[],
  youtube: Pick<youtube_v3.Youtube, "channels">,
  now = Date.now()
) {
  if (!messages.length) {
    return messages;
  }

  const cachedTitles = new Map<string, string>();
  const idsToFetch: string[] = [];
  const seenIds = new Set<string>();

  for (const message of messages) {
    const channelId = normalizedChannelId(message.authorChannelId);
    if (!channelId || seenIds.has(channelId)) {
      continue;
    }
    seenIds.add(channelId);

    const cached = channelTitleCache.get(channelId);
    if (cached && cached.expiresAt > now) {
      if (cached.title) {
        cachedTitles.set(channelId, cached.title);
      }
      continue;
    }

    if (cached) {
      channelTitleCache.delete(channelId);
    }
    idsToFetch.push(channelId);
  }

  const fetchedTitles = idsToFetch.length
    ? await fetchChannelTitles(youtube, idsToFetch, now).catch((error: unknown) => {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            channelCount: idsToFetch.length
          },
          "YouTube channel title lookup failed; falling back to live chat display names."
        );
        return new Map<string, string>();
      })
    : new Map<string, string>();
  const titles = new Map([...cachedTitles, ...fetchedTitles]);

  return messages.map((message) => {
    const channelId = normalizedChannelId(message.authorChannelId);
    const authorName = channelId ? titles.get(channelId) : undefined;
    if (authorName && authorName !== message.authorName) {
      return { ...message, authorName };
    }
    if (channelId && isIdLikeAuthorName(message.authorName, channelId)) {
      return { ...message, authorName: "YouTube視聴者" };
    }
    return message;
  });
}

export function clearLiveChatAuthorNameCache() {
  channelTitleCache.clear();
}

async function fetchChannelTitles(
  youtube: Pick<youtube_v3.Youtube, "channels">,
  channelIds: string[],
  now: number
) {
  const titles = new Map<string, string>();

  for (const batch of chunkArray(channelIds, maxChannelTitleLookupIds)) {
    const response = await youtube.channels.list({
      part: ["snippet"],
      id: batch,
      maxResults: batch.length
    });
    const foundIds = new Set<string>();

    for (const item of response.data.items ?? []) {
      const channelId = normalizedChannelId(item.id);
      if (!channelId) {
        continue;
      }
      foundIds.add(channelId);

      const title = firstNonBlankString(item.snippet?.localized?.title, item.snippet?.title) ?? null;
      channelTitleCache.set(channelId, {
        title,
        expiresAt: now + (title ? channelTitleCacheTtlMs : missingChannelTitleCacheTtlMs)
      });
      if (title) {
        titles.set(channelId, title);
      }
    }

    for (const channelId of batch) {
      if (!foundIds.has(channelId)) {
        channelTitleCache.set(channelId, {
          title: null,
          expiresAt: now + missingChannelTitleCacheTtlMs
        });
      }
    }
  }

  trimChannelTitleCache(now);
  return titles;
}

function trimChannelTitleCache(now: number) {
  for (const [channelId, entry] of channelTitleCache) {
    if (entry.expiresAt <= now) {
      channelTitleCache.delete(channelId);
    }
  }

  while (channelTitleCache.size > maxChannelTitleCacheEntries) {
    const oldestChannelId = channelTitleCache.keys().next().value;
    if (!oldestChannelId) {
      return;
    }
    channelTitleCache.delete(oldestChannelId);
  }
}

function normalizedChannelId(channelId: string | null | undefined) {
  const normalized = channelId?.trim();
  return normalized ? normalized : undefined;
}

function isIdLikeAuthorName(authorName: string, authorChannelId: string) {
  const normalized = authorName.trim();
  return normalized === authorChannelId || /^UC[A-Za-z0-9_-]{20,}$/.test(normalized);
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
