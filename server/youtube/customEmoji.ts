import { Innertube } from "youtubei.js";
import type { ChatMessageContentSegment } from "@/types";
import { logger } from "@/lib/logger";

type RichChatItem = {
  id?: unknown;
  message?: unknown;
};

type EmojiThumbnail = {
  url?: unknown;
  width?: unknown;
  height?: unknown;
};

type EmojiRun = {
  text?: unknown;
  emoji?: {
    shortcuts?: unknown;
    image?: unknown;
  };
};

type TextRun = {
  text?: unknown;
};

type LiveChatHandle = {
  on(type: "chat-update", listener: (action: { item?: unknown }) => void): void;
  on(type: "error", listener: (error: Error) => void): void;
  start(): void;
  stop(): void;
};

const emojiTargetPixels = 48;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function validEmojiImageUrl(value: unknown) {
  const url = asString(value);
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function numericDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Pick a sharp but not needlessly large thumbnail for inline chat rendering. */
export function selectEmojiImage(thumbnails: unknown): string | undefined {
  if (!Array.isArray(thumbnails)) return undefined;

  const usable = thumbnails
    .map((thumbnail) => {
      const data = thumbnail as EmojiThumbnail;
      const url = validEmojiImageUrl(data?.url);
      return {
        url,
        size: Math.max(numericDimension(data?.width), numericDimension(data?.height))
      };
    })
    .filter((thumbnail): thumbnail is { url: string; size: number } => Boolean(thumbnail.url));

  if (!usable.length) return undefined;
  return (
    usable.filter((thumbnail) => thumbnail.size >= emojiTargetPixels).sort((a, b) => a.size - b.size)[0]?.url ??
    usable.sort((a, b) => b.size - a.size)[0]?.url
  );
}

function emojiSegment(run: EmojiRun): ChatMessageContentSegment | undefined {
  const imageUrl = selectEmojiImage(run.emoji?.image);
  if (!imageUrl) return undefined;

  const shortcuts = Array.isArray(run.emoji?.shortcuts)
    ? run.emoji.shortcuts.filter((shortcut): shortcut is string => typeof shortcut === "string")
    : [];
  const shortcode = shortcuts[0] ?? asString(run.text);

  return {
    kind: "emoji",
    imageUrl,
    alt: asString(run.text) ?? shortcode ?? "YouTube emoji",
    shortcode
  };
}

/**
 * Converts InnerTube rich text into data that can be transported to the browser.
 * Returning undefined deliberately keeps the official API text as the fallback.
 */
export function extractYouTubeChatContent(message: unknown): ChatMessageContentSegment[] | undefined {
  if (!isRecord(message) || !Array.isArray(message.runs)) return undefined;

  const segments: ChatMessageContentSegment[] = [];
  let hasEmojiImage = false;

  for (const value of message.runs) {
    if (!isRecord(value)) continue;
    const emoji = emojiSegment(value as EmojiRun);
    if (emoji) {
      segments.push(emoji);
      hasEmojiImage = true;
      continue;
    }

    const text = asString((value as TextRun).text);
    if (text) {
      segments.push({ kind: "text", text });
    }
  }

  return hasEmojiImage && segments.length ? segments : undefined;
}

function contentFromChatItem(item: unknown) {
  if (!isRecord(item)) return undefined;
  const richItem = item as RichChatItem;
  const platformMessageId = asString(richItem.id);
  const content = extractYouTubeChatContent(richItem.message);
  return platformMessageId && content ? { platformMessageId, content } : undefined;
}

/**
 * Watches YouTube's web-client (InnerTube) live chat only to enrich official
 * Data API messages with emoji image URLs. The official API remains the source
 * of truth for message delivery and deletion handling.
 */
export class YouTubeCustomEmojiStream {
  private stopped = false;
  private liveChat: LiveChatHandle | null = null;

  constructor(
    private readonly videoId: string,
    private readonly onContent: (platformMessageId: string, content: ChatMessageContentSegment[]) => void
  ) {}

  start() {
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.liveChat?.stop();
    this.liveChat = null;
  }

  private async connect() {
    try {
      const innertube = await Innertube.create();
      if (this.stopped) return;

      const info = await innertube.getInfo(this.videoId);
      if (this.stopped) return;

      const liveChat = info.getLiveChat() as unknown as LiveChatHandle;
      this.liveChat = liveChat;
      liveChat.on("chat-update", (action) => {
        if (this.stopped) return;
        const result = contentFromChatItem(action.item);
        if (result) {
          this.onContent(result.platformMessageId, result.content);
        }
      });
      liveChat.on("error", (error) => {
        if (!this.stopped) {
          logger.warn({ videoId: this.videoId, error: error.message }, "YouTube custom emoji stream failed.");
        }
      });
      liveChat.start();
    } catch (error) {
      if (!this.stopped) {
        logger.warn(
          { videoId: this.videoId, error: error instanceof Error ? error.message : String(error) },
          "YouTube custom emoji enrichment is unavailable; falling back to text."
        );
      }
    }
  }
}
