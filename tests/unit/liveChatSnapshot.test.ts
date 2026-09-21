import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedClient: vi.fn(),
  list: vi.fn(),
  youtube: vi.fn()
}));

vi.mock("googleapis", () => ({
  google: {
    youtube: mocks.youtube
  }
}));

vi.mock("@/server/youtube/oauth", () => ({
  getAuthorizedClient: mocks.getAuthorizedClient
}));

import { getLiveChatSnapshot } from "@/server/youtube/api";

function normalItem(id: string) {
  return {
    id,
    snippet: {
      type: "textMessageEvent",
      publishedAt: "2026-05-20T12:00:00.000Z",
      displayMessage: id,
      textMessageDetails: { messageText: id }
    },
    authorDetails: {
      channelId: `channel-${id}`,
      displayName: `Viewer ${id}`
    }
  };
}

describe("getLiveChatSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedClient.mockResolvedValue({});
    mocks.youtube.mockReturnValue({
      liveChatMessages: {
        list: mocks.list
      }
    });
  });

  test("requests one current 200-message view and separates normal messages from tombstones", async () => {
    mocks.list.mockResolvedValue({
      data: {
        items: [
          normalItem("active"),
          {
            id: "removed",
            snippet: {
              type: "tombstone",
              publishedAt: "2026-05-20T11:59:00.000Z"
            }
          }
        ]
      }
    });

    const result = await getLiveChatSnapshot("live-chat-1");

    expect(mocks.list).toHaveBeenCalledWith({
      liveChatId: "live-chat-1",
      part: ["id", "snippet", "authorDetails"],
      maxResults: 200,
      hl: "ja"
    });
    expect(result.saturated).toBe(false);
    expect(result.messages).toMatchObject([{ platformMessageId: "active", messageText: "active" }]);
    expect(result.deletions).toEqual([
      {
        targetPlatformMessageId: "removed",
        deletionStatus: "deleted",
        deletedAt: "2026-05-20T11:59:00.000Z"
      }
    ]);
  });

  test("extracts a retraction placeholder for display-time candidate validation", async () => {
    mocks.list.mockResolvedValue({
      data: {
        items: [
          {
            id: "placeholder",
            snippet: {
              type: "textMessageEvent",
              publishedAt: "2026-05-20T12:01:00.000Z",
              displayMessage: "メッセージが撤回されました"
            },
            authorDetails: {
              channelId: "channel-1",
              displayName: "Viewer"
            }
          }
        ]
      }
    });

    const result = await getLiveChatSnapshot("live-chat-1");

    expect(result.deletions).toEqual([
      {
        targetAuthorChannelId: "channel-1",
        authorRetractionAnchor: "2026-05-20T12:01:00.000Z",
        deletionStatus: "retracted",
        deletedAt: "2026-05-20T12:01:00.000Z"
      }
    ]);
  });

  test("marks an exactly full response as saturated", async () => {
    mocks.list.mockResolvedValue({
      data: {
        items: Array.from({ length: 200 }, (_, index) => normalItem(`message-${index}`))
      }
    });

    const result = await getLiveChatSnapshot("live-chat-1");

    expect(result.messages).toHaveLength(200);
    expect(result.saturated).toBe(true);
  });
});
