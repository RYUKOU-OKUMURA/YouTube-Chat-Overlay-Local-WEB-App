/**
 * 削除コメント表示の調査用テスト。
 * 実配信で起きうるペイロード形状と、現行実装のギャップを記録する。
 */
import { describe, expect, test } from "vitest";
import {
  deletionMergeKey,
  isYoutubeSystemRetractedMessage,
  mapLiveChatMessage,
  mapLiveChatMessageDeletion,
  mapLiveChatStreamItems,
  mapRemovalPlaceholderDeletion,
  parseLiveChatStreamResponses
} from "@/server/youtube/api";
import type { ChatMessage } from "@/types";

function bindPrivateIngestMessages(controller: unknown) {
  return (controller as { ingestMessages: (messages: ChatMessage[]) => void }).ingestMessages.bind(controller);
}

function bindPrivateApplyMessageDeletions(controller: unknown) {
  return (controller as { applyMessageDeletions: (deletions: unknown[]) => void }).applyMessageDeletions.bind(
    controller
  );
}

describe("deletion investigation — payload gaps", () => {
  test("deletionMergeKey keeps distinct anchor-based retractions from the same author", () => {
    const first = {
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
      deletionStatus: "retracted" as const,
      deletedAt: "2026-04-27T12:01:00.000Z"
    };
    const second = {
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:05:00.000Z",
      deletionStatus: "retracted" as const,
      deletedAt: "2026-04-27T12:05:00.000Z"
    };

    expect(deletionMergeKey(first)).not.toBe(deletionMergeKey(second));

    const merged = new Map<string, (typeof first)>();
    for (const deletion of [first, second]) {
      const key = deletionMergeKey(deletion);
      if (key) {
        merged.set(key, deletion);
      }
    }
    expect([...merged.values()]).toHaveLength(2);
  });

  test("maps deleted placeholder to author anchor deletion", () => {
    expect(
      mapRemovalPlaceholderDeletion({
        id: "placeholder-deleted",
        platformMessageId: "placeholder-deleted",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "[Message deleted]",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:02:00.000Z"
      })
    ).toEqual({
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:02:00.000Z",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:02:00.000Z"
    });
  });

  test("mapLiveChatMessage falls back to snippet.authorChannelId when authorDetails is missing", () => {
    expect(
      mapLiveChatMessage({
        id: "msg-snippet-author",
        snippet: {
          type: "textMessageEvent",
          authorChannelId: "snippet-channel-1",
          displayMessage: "hello",
          publishedAt: "2026-04-27T12:00:00.000Z"
        },
        authorDetails: {
          displayName: "Viewer"
        }
      })
    ).toMatchObject({
      platformMessageId: "msg-snippet-author",
      authorChannelId: "snippet-channel-1"
    });
  });

  test("detects Studio retract placeholder text", () => {
    expect(isYoutubeSystemRetractedMessage("メッセージが撤回されました")).toBe(true);
    expect(
      mapRemovalPlaceholderDeletion({
        id: "placeholder-1",
        platformMessageId: "placeholder-1",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "メッセージが撤回されました",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      })
    ).toEqual({
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
      deletionStatus: "retracted",
      deletedAt: "2026-04-27T12:01:00.000Z"
    });
  });

  test("tombstone without details uses item.id as target (YouTube spec)", () => {
    expect(
      mapLiveChatMessageDeletion({
        id: "original-msg-id",
        snippet: {
          type: "tombstone",
          publishedAt: "2026-04-27T12:06:30.000Z"
        }
      })
    ).toEqual({
      targetPlatformMessageId: "original-msg-id",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:06:30.000Z"
    });
  });

  test("messageRetractedEvent without retractedMessageId falls back to author anchor resolution when channelId is present", () => {
    expect(
      mapLiveChatMessageDeletion({
        id: "retract-event-id",
        snippet: {
          type: "messageRetractedEvent",
          publishedAt: "2026-04-27T12:06:00.000Z",
          authorChannelId: "channel-1"
        }
      })
    ).toEqual({
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:06:00.000Z",
      deletionStatus: "retracted",
      deletedAt: "2026-04-27T12:06:00.000Z"
    });
  });

  test("messageRetractedEvent without retractedMessageId and without authorChannelId is ignored", () => {
    expect(
      mapLiveChatMessageDeletion({
        id: "retract-event-id",
        snippet: {
          type: "messageRetractedEvent",
          publishedAt: "2026-04-27T12:06:00.000Z"
        }
      })
    ).toBeNull();
  });

  test("messageRetractedEvent without retractedMessageId produces author anchor stream deletions", () => {
    expect(
      mapLiveChatStreamItems([
        {
          id: "retract-event-id",
          snippet: {
            type: "messageRetractedEvent",
            publishedAt: "2026-04-27T12:06:00.000Z",
            authorChannelId: "channel-1"
          }
        }
      ])
    ).toEqual({
      messages: [],
      deletions: [
        {
          targetAuthorChannelId: "channel-1",
          authorRetractionAnchor: "2026-04-27T12:06:00.000Z",
          deletionStatus: "retracted",
          deletedAt: "2026-04-27T12:06:00.000Z"
        }
      ]
    });
  });

  test("messageDeletedEvent without deletedMessageId falls back to author anchor resolution when channelId is present", () => {
    const result = mapLiveChatMessageDeletion({
      id: "delete-event-id",
      snippet: {
        type: "messageDeletedEvent",
        publishedAt: "2026-04-27T12:05:00.000Z",
        authorChannelId: "channel-1"
      }
    });
    expect(result).toEqual({
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:05:00.000Z",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:05:00.000Z"
    });
  });

  test("messageDeletedEvent without deletedMessageId and without authorChannelId is ignored", () => {
    const result = mapLiveChatMessageDeletion({
      id: "delete-event-id",
      snippet: {
        type: "messageDeletedEvent",
        publishedAt: "2026-04-27T12:05:00.000Z"
      }
    });
    expect(result).toBeNull();
  });

  test("stream normalizes retract event with snake_case only", async () => {
    const responses = [];
    for await (const response of parseLiveChatStreamResponses(
      (async function* () {
        yield Buffer.from(
          '{"items":[{"id":"retract-event-1","snippet":{"type":"messageRetractedEvent","published_at":"2026-04-27T12:06:00.000Z","message_retracted_details":{"retracted_message_id":"original-msg-id"}}}]}'
        );
      })()
    )) {
      responses.push(response);
    }
    const item = responses[0]?.items?.[0];
    expect(mapLiveChatMessageDeletion(item!)).toEqual({
      targetPlatformMessageId: "original-msg-id",
      deletionStatus: "retracted",
      deletedAt: "2026-04-27T12:06:00.000Z"
    });
  });

  test("re-sending textMessageEvent with same id still maps as a new message at stream layer", () => {
    const first = mapLiveChatStreamItems([
      {
        id: "msg-1",
        snippet: {
          type: "textMessageEvent",
          publishedAt: "2026-04-27T12:00:00.000Z",
          displayMessage: "hello"
        },
        authorDetails: { displayName: "Viewer" }
      }
    ]);
    const second = mapLiveChatStreamItems([
      {
        id: "msg-1",
        snippet: {
          type: "textMessageEvent",
          publishedAt: "2026-04-27T12:00:00.000Z",
          displayMessage: "[Message deleted]"
        },
        authorDetails: { displayName: "Viewer" }
      }
    ]);
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].messageText).toBe("hello");
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0].messageText).toBe("[Message deleted]");
    expect(second.deletions).toEqual([]);
  });
});

describe("deletion investigation — appController matching", () => {
  test("does not treat normal comments about deletion as deleted messages", () => {
    expect(
      mapLiveChatStreamItems([
        {
          id: "LCC.comment-about-deletion",
          snippet: {
            type: "textMessageEvent",
            publishedAt: "2026-05-19T09:49:38.659Z",
            displayMessage: "コメントが削除されていくｗ",
            textMessageDetails: {
              messageText: "コメントが削除されていくｗ"
            }
          },
          authorDetails: { displayName: "Viewer" }
        }
      ])
    ).toMatchObject({
      messages: [{ platformMessageId: "LCC.comment-about-deletion", messageText: "コメントが削除されていくｗ" }],
      deletions: []
    });
  });

  test("keeps first-stream text messages even when displayMessage looks like a system deletion", () => {
    expect(
      mapLiveChatStreamItems([
        {
          id: "msg-1",
          snippet: {
            type: "textMessageEvent",
            publishedAt: "2026-04-27T12:01:00.000Z",
            displayMessage: "[Message deleted]"
          },
          authorDetails: { displayName: "Viewer" }
        }
      ])
    ).toMatchObject({
      messages: [{ platformMessageId: "msg-1", messageText: "[Message deleted]" }],
      deletions: []
    });
  });

  test("re-ingests evicted message with deletionStatus when registry recorded the deletion", async () => {
    const { AppController } = await import("@/server/state/appController");
    const { maxFetchedMessageIds } = await import("@/lib/messageRetention");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);
    const applyDeletions = bindPrivateApplyMessageDeletions(controller);
    const controllerPrivate = controller as unknown as {
      rememberFetchedMessageId: (id: string) => boolean;
    };

    const evictedMessage: ChatMessage = {
      id: "evicted-msg",
      platformMessageId: "evicted-msg",
      authorName: "Viewer",
      authorChannelId: "channel-1",
      messageText: "will be evicted",
      messageType: "textMessageEvent",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat: false,
      publishedAt: "2026-04-27T12:00:00.000Z"
    };

    ingest([evictedMessage]);
    const filler = Array.from({ length: 300 }, (_, index) => ({
      id: `filler-${index}`,
      platformMessageId: `filler-${index}`,
      authorName: "Viewer",
      authorChannelId: "channel-1",
      messageText: `filler ${index}`,
      messageType: "textMessageEvent",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat: false,
      publishedAt: `2026-04-27T12:${String((index + 1) % 60).padStart(2, "0")}:00.000Z`
    }));
    ingest(filler);
    expect((await controller.getMessages()).some((item) => item.platformMessageId === "evicted-msg")).toBe(false);

    applyDeletions([
      {
        targetPlatformMessageId: "evicted-msg",
        deletionStatus: "deleted",
        deletedAt: "2026-04-27T12:05:00.000Z"
      }
    ]);

    for (let index = 0; index < maxFetchedMessageIds; index += 1) {
      controllerPrivate.rememberFetchedMessageId(`dedupe-${index}`);
    }

    ingest([{ ...evictedMessage, messageText: "resend after eviction" }]);
    expect((await controller.getMessages()).find((item) => item.platformMessageId === "evicted-msg")).toMatchObject({
      messageText: "このコメントは削除されました。",
      deletionStatus: "deleted"
    });
  });

  test("documents fetchedMessageId dedup blocking re-ingest of same platformMessageId", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    const ingest = (
      controller as unknown as {
        ingestMessages: (messages: ChatMessage[]) => void;
        rememberFetchedMessageId: (id: string) => boolean;
      }
    );

    const message: ChatMessage = {
      id: "msg-1",
      platformMessageId: "msg-1",
      authorName: "Viewer",
      messageText: "hello",
      messageType: "textMessageEvent",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat: false,
      publishedAt: "2026-04-27T12:00:00.000Z"
    };

    ingest.ingestMessages([message]);
    expect(ingest.rememberFetchedMessageId("msg-1")).toBe(false);

    const updated: ChatMessage = { ...message, messageText: "[deleted]" };
    ingest.ingestMessages([updated]);
    const messages = await controller.getMessages();
    expect(messages[0]?.messageText).toBe("hello");
  });

  test("links a fresh retract placeholder to the latest message from the same author", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "original-msg",
        platformMessageId: "original-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    ingest([
      {
        id: "placeholder-msg",
        platformMessageId: "placeholder-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "メッセージが撤回されました",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      }
    ]);

    expect((await controller.getMessages()).find((message) => message.platformMessageId === "original-msg")).toMatchObject({
      messageText: "このコメントは投稿者により取り消されました。",
      deletionStatus: "retracted"
    });
    expect((await controller.getMessages()).some((message) => message.platformMessageId === "placeholder-msg")).toBe(false);
  });

  test("replays a retract placeholder that arrives before the original message in the same batch", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "placeholder-msg",
        platformMessageId: "placeholder-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "メッセージが撤回されました",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      },
      {
        id: "original-msg",
        platformMessageId: "original-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    const messages = await controller.getMessages();
    expect(messages.find((message) => message.platformMessageId === "original-msg")).toMatchObject({
      messageText: "このコメントは投稿者により取り消されました。",
      deletionStatus: "retracted"
    });
    expect(messages.some((message) => message.platformMessageId === "placeholder-msg")).toBe(false);
  });

  test("marks duplicate resend with retracted-looking text as retracted", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "msg-1",
        platformMessageId: "msg-1",
        authorName: "Viewer",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    ingest([
      {
        id: "msg-1",
        platformMessageId: "msg-1",
        authorName: "Viewer",
        messageText: "メッセージが撤回されました",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      }
    ]);

    expect((await controller.getMessages())[0]).toMatchObject({
      messageText: "このコメントは投稿者により取り消されました。",
      deletionStatus: "retracted"
    });
  });

  test("applies pending author-anchor retraction after the original message is ingested", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);
    const applyDeletions = bindPrivateApplyMessageDeletions(controller);

    applyDeletions([
      {
        targetAuthorChannelId: "channel-1",
        authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
        deletionStatus: "retracted",
        deletedAt: "2026-04-27T12:01:00.000Z"
      }
    ]);

    ingest([
      {
        id: "original-msg",
        platformMessageId: "original-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    expect((await controller.getMessages()).find((item) => item.platformMessageId === "original-msg")).toMatchObject({
      messageText: "このコメントは投稿者により取り消されました。",
      deletionStatus: "retracted"
    });
  });

  test("retracts only the message before the placeholder when the author posted twice", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "older-msg",
        platformMessageId: "older-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "first",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      },
      {
        id: "newer-msg",
        platformMessageId: "newer-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "second",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:10:00.000Z"
      }
    ]);

    ingest([
      {
        id: "placeholder-msg",
        platformMessageId: "placeholder-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "メッセージが撤回されました",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:05:00.000Z"
      }
    ]);

    const messages = await controller.getMessages();
    expect(messages.find((item) => item.platformMessageId === "older-msg")).toMatchObject({
      deletionStatus: "retracted"
    });
    expect(messages.find((item) => item.platformMessageId === "newer-msg")).toEqual(
      expect.objectContaining({
        messageText: "second"
      })
    );
    expect(messages.find((item) => item.platformMessageId === "newer-msg")).not.toHaveProperty(
      "deletionStatus"
    );
  });

  test("links deleted placeholder text to the original message via author anchor", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "original-msg",
        platformMessageId: "original-msg",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    ingest([
      {
        id: "placeholder-deleted",
        platformMessageId: "placeholder-deleted",
        authorName: "Viewer",
        authorChannelId: "channel-1",
        messageText: "[Message deleted]",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      }
    ]);

    expect((await controller.getMessages()).find((item) => item.platformMessageId === "original-msg")).toMatchObject({
      messageText: "このコメントは削除されました。",
      deletionStatus: "deleted"
    });
    expect((await controller.getMessages()).some((item) => item.platformMessageId === "placeholder-deleted")).toBe(false);
  });

  test("marks duplicate resend with deleted-looking text as deleted", async () => {
    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    await controller.init();
    const ingest = bindPrivateIngestMessages(controller);

    ingest([
      {
        id: "msg-1",
        platformMessageId: "msg-1",
        authorName: "Viewer",
        messageText: "hello",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:00:00.000Z"
      }
    ]);

    ingest([
      {
        id: "msg-1",
        platformMessageId: "msg-1",
        authorName: "Viewer",
        messageText: "[Message deleted]",
        messageType: "textMessageEvent",
        isMember: false,
        isModerator: false,
        isOwner: false,
        isSuperChat: false,
        publishedAt: "2026-04-27T12:01:00.000Z"
      }
    ]);

    expect((await controller.getMessages())[0]).toMatchObject({
      messageText: "このコメントは削除されました。",
      deletionStatus: "deleted"
    });
  });
});
