/**
 * 削除コメント表示の調査用テスト。
 * 実配信で起きうるペイロード形状と、現行実装のギャップを記録する。
 */
import { describe, expect, test } from "vitest";
import {
  isYoutubeSystemRetractedMessage,
  mapLiveChatMessageDeletion,
  mapLiveChatStreamItems,
  mapRemovalPlaceholderDeletion,
  parseLiveChatStreamResponses
} from "@/server/youtube/api";
import type { ChatMessage } from "@/types";

function bindPrivateIngestMessages(controller: unknown) {
  return (controller as { ingestMessages: (messages: ChatMessage[]) => void }).ingestMessages.bind(controller);
}

describe("deletion investigation — payload gaps", () => {
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

  test("messageRetractedEvent without retractedMessageId is ignored (item.id is the event id, not the target)", () => {
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

  test("messageRetractedEvent without retractedMessageId does not produce stream deletions", () => {
    expect(
      mapLiveChatStreamItems([
        {
          id: "retract-event-id",
          snippet: {
            type: "messageRetractedEvent",
            publishedAt: "2026-04-27T12:06:00.000Z"
          }
        }
      ])
    ).toEqual({
      messages: [],
      deletions: []
    });
  });

  test("messageDeletedEvent without deletedMessageId is ignored", () => {
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
