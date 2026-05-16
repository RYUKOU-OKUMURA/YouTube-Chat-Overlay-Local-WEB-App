import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearLiveChatAuthorNameCache,
  JsonObjectStreamParser,
  YouTubeStreamParserError,
  YouTubeStreamTruncatedError,
  YouTubeStreamResponseShapeError,
  mapLiveChatMessage,
  mapLiveChatMessageDeletion,
  parseLiveChatStreamResponses,
  resolveLiveChatAuthorNames
} from "@/server/youtube/api";
import type { ChatMessage } from "@/types";

async function* chunks(values: Array<Buffer | string>) {
  for (const value of values) {
    yield value;
  }
}

function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    platformMessageId: "message-1",
    authorName: "@viewer-id",
    authorChannelId: "channel-1",
    messageText: "hello",
    messageType: "textMessageEvent",
    isMember: false,
    isModerator: false,
    isOwner: false,
    isSuperChat: false,
    publishedAt: "2026-04-27T12:00:00.000Z",
    ...overrides
  };
}

function youtubeWithChannelItems(items: unknown[]) {
  const list = vi.fn().mockResolvedValue({ data: { items } });
  return {
    youtube: { channels: { list } } as unknown as Parameters<typeof resolveLiveChatAuthorNames>[1],
    list
  };
}

beforeEach(() => {
  clearLiveChatAuthorNameCache();
});

describe("YouTube live chat stream parser", () => {
  test("parses split JSON responses", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"nextPageToken":"token-1","items":[{"id":"message-1","snippet":{"displayMessage":"hel',
        'lo","type":"textMessageEvent"},"authorDetails":{"displayName":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe("hello");
  });

  test("preserves multibyte UTF-8 characters split across buffer chunks", async () => {
    const message = "こんばんはー。新参者ですがいつも楽しく見させていただいてます♪";
    const payload = Buffer.from(
      JSON.stringify({
        nextPageToken: "token-1",
        items: [
          {
            id: "message-1",
            snippet: { displayMessage: message, type: "textMessageEvent" },
            authorDetails: { displayName: "Viewer" }
          }
        ]
      })
    );
    const splitAt = payload.indexOf(Buffer.from("だ")) + 1;
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(chunks([payload.subarray(0, splitAt), payload.subarray(splitAt)]))) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe(message);
  });

  test("parses multiple JSON responses from one chunk", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"nextPageToken":"token-1","items":[]}\n{"offlineAt":"2026-04-27T12:00:00.000Z","items":[]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[1].offlineAt).toBe("2026-04-27T12:00:00.000Z");
  });

  test("parses objects from YouTube streaming JSON arrays before the array closes", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '[{"next_page_token":"token-1","items":[{"id":"message-1","snippet":{"display_message":"hello","type":"textMessageEvent"},"author_details":{"display_name":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe("hello");
    expect(responses[0].items?.[0].authorDetails?.displayName).toBe("Viewer");
  });

  test("normalizes snake-case Super Sticker stream details", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"items":[{"id":"sticker-1","snippet":{"type":"superStickerEvent","display_message":"","super_sticker_details":{"amount_display_string":"¥300","super_sticker_metadata":{"alt_text":"Hands doing the sign of the horns with sparkles around","alt_text_language":"en","sticker_id":"hands-horns"}}},"author_details":{"display_name":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    const sticker = responses[0].items?.[0];
    expect(sticker?.snippet?.type).toBe("superStickerEvent");
    expect(sticker?.snippet?.superStickerDetails?.amountDisplayString).toBe("¥300");
    expect(sticker?.snippet?.superStickerDetails?.superStickerMetadata?.altText).toBe(
      "Hands doing the sign of the horns with sparkles around"
    );
    expect(sticker?.snippet?.superStickerDetails?.superStickerMetadata?.stickerId).toBe("hands-horns");
  });

  test("normalizes snake-case text message details with Unicode emoji", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"items":[{"id":"emoji-1","snippet":{"type":"textMessageEvent","display_message":"smiling_face red_heart","text_message_details":{"message_text":"最高です 😊❤️"}},"author_details":{"display_name":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    const message = responses[0].items?.[0];
    expect(message?.snippet?.textMessageDetails?.messageText).toBe("最高です 😊❤️");
    expect(message ? mapLiveChatMessage(message).messageText : undefined).toBe("最高です 😊❤️");
  });

  test("normalizes snake-case deletion and retraction details", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"items":[{"id":"delete-event-1","snippet":{"type":"messageDeletedEvent","published_at":"2026-04-27T12:05:00.000Z","message_deleted_details":{"deleted_message_id":"message-1"}}},{"id":"retract-event-1","snippet":{"type":"messageRetractedEvent","published_at":"2026-04-27T12:06:00.000Z","message_retracted_details":{"retracted_message_id":"message-2"}}}]}'
      ])
    )) {
      responses.push(response);
    }

    const deleted = responses[0].items?.[0];
    const retracted = responses[0].items?.[1];
    expect(deleted).toBeDefined();
    expect(retracted).toBeDefined();
    if (!deleted || !retracted) {
      throw new Error("Expected deletion and retraction events.");
    }
    expect(mapLiveChatMessageDeletion(deleted)).toEqual({
      targetPlatformMessageId: "message-1",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:05:00.000Z"
    });
    expect(mapLiveChatMessageDeletion(retracted)).toEqual({
      targetPlatformMessageId: "message-2",
      deletionStatus: "retracted",
      deletedAt: "2026-04-27T12:06:00.000Z"
    });
  });

  test("normalizes snake-case user ban events as author deletions", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"items":[{"id":"ban-event-1","snippet":{"type":"userBannedEvent","published_at":"2026-04-27T12:08:00.000Z","user_banned_details":{"banned_user_details":{"channel_id":"banned-channel-1"},"ban_type":"temporary"}}}]}'
      ])
    )) {
      responses.push(response);
    }

    const banned = responses[0].items?.[0];
    expect(banned).toBeDefined();
    if (!banned) {
      throw new Error("Expected user ban event.");
    }
    expect(mapLiveChatMessageDeletion(banned)).toEqual({
      targetAuthorChannelId: "banned-channel-1",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:08:00.000Z"
    });
  });

  test("parses multiple objects from a streaming JSON array", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '[{"nextPageToken":"token-1","items":[]}',
        ',{"offline_at":"2026-04-27T12:00:00.000Z","items":[]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[1].offlineAt).toBe("2026-04-27T12:00:00.000Z");
  });

  test("ignores empty chunks", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push("")).toEqual([]);
    expect(parser.push("\n\n")).toEqual([]);
    expect(parser.flush()).toEqual([]);
  });

  test("throws retryable truncated stream errors for incomplete JSON at flush", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push('{"items":[')).toEqual([]);
    let thrown: unknown;
    try {
      parser.flush();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(YouTubeStreamTruncatedError);
    expect(thrown).toMatchObject({
      kind: "network",
      reason: "incomplete_stream_json",
      retryable: true
    });
  });

  test("throws terminal parser errors for complete invalid JSON objects", () => {
    const parser = new JsonObjectStreamParser();

    expect(() => parser.push("{invalid}")).toThrow(YouTubeStreamParserError);
  });

  test("throws terminal parser errors for non JSON stream content", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push("not-json")).toEqual([]);
    expect(() => parser.flush()).toThrow(YouTubeStreamParserError);
  });

  test("throws terminal response shape errors for invalid list responses", async () => {
    await expect(async () => {
      for await (const response of parseLiveChatStreamResponses(chunks(['{"items":{"id":"message-1"}}']))) {
        expect(response).toBeDefined();
        // Exhaust the async iterator so parser errors surface in the assertion.
      }
    }).rejects.toThrow(YouTubeStreamResponseShapeError);
  });
});

describe("YouTube live chat author name resolution", () => {
  test("replaces handle-like live chat names with the channel title", async () => {
    const { youtube, list } = youtubeWithChannelItems([
      {
        id: "channel-1",
        snippet: {
          title: "普通の表示名"
        }
      }
    ]);

    const resolved = await resolveLiveChatAuthorNames([chatMessage()], youtube);

    expect(resolved[0].authorName).toBe("普通の表示名");
    expect(resolved[0].messageText).toBe("hello");
    expect(list).toHaveBeenCalledWith({
      part: ["snippet"],
      id: ["channel-1"],
      maxResults: 1
    });
  });

  test("prefers localized channel titles when YouTube returns them", async () => {
    const { youtube } = youtubeWithChannelItems([
      {
        id: "channel-1",
        snippet: {
          title: "Default title",
          localized: {
            title: "日本語の表示名"
          }
        }
      }
    ]);

    const resolved = await resolveLiveChatAuthorNames([chatMessage()], youtube);

    expect(resolved[0].authorName).toBe("日本語の表示名");
  });

  test("caches channel titles so repeated viewers do not trigger repeated lookups", async () => {
    const { youtube, list } = youtubeWithChannelItems([
      {
        id: "channel-1",
        snippet: {
          title: "キャッシュ済み視聴者"
        }
      }
    ]);

    const first = await resolveLiveChatAuthorNames([chatMessage()], youtube);
    const second = await resolveLiveChatAuthorNames(
      [chatMessage({ id: "message-2", platformMessageId: "message-2" })],
      youtube
    );

    expect(first[0].authorName).toBe("キャッシュ済み視聴者");
    expect(second[0].authorName).toBe("キャッシュ済み視聴者");
    expect(list).toHaveBeenCalledTimes(1);
  });

  test("does not spend channel lookup quota when the live chat name already looks resolved", async () => {
    const { youtube, list } = youtubeWithChannelItems([
      {
        id: "channel-1",
        snippet: {
          title: "普通の表示名"
        }
      }
    ]);

    const resolved = await resolveLiveChatAuthorNames(
      [chatMessage({ authorName: "普通の表示名" })],
      youtube
    );

    expect(resolved[0].authorName).toBe("普通の表示名");
    expect(list).not.toHaveBeenCalled();
  });

  test("batches uncached channel title lookups in groups of fifty", async () => {
    const list = vi.fn().mockResolvedValue({ data: { items: [] } });
    const youtube = {
      channels: { list }
    } as unknown as Parameters<typeof resolveLiveChatAuthorNames>[1];
    const messages = Array.from({ length: 51 }, (_, index) =>
      chatMessage({
        id: `message-${index}`,
        platformMessageId: `message-${index}`,
        authorChannelId: `channel-${index}`
      })
    );

    await resolveLiveChatAuthorNames(messages, youtube);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: Array.from({ length: 50 }, (_, index) => `channel-${index}`),
        maxResults: 50
      })
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: ["channel-50"],
        maxResults: 1
      })
    );
  });
});
