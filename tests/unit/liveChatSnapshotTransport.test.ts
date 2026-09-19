import nock from "nock";
import { google } from "googleapis";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedClient: vi.fn()
}));

vi.mock("@/server/youtube/oauth", () => ({
  getAuthorizedClient: mocks.getAuthorizedClient
}));

import { getLiveChatSnapshot } from "@/server/youtube/api";

const youtubeApiOrigin = "https://youtube.googleapis.com";

function authorizedClient() {
  const auth = new google.auth.OAuth2("test-client-id", "test-client-secret");
  auth.setCredentials({ access_token: "test-access-token" });
  return auth;
}

describe("getLiveChatSnapshot transport", () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
    mocks.getAuthorizedClient.mockResolvedValue(authorizedClient());
  });

  afterEach(() => {
    expect(nock.pendingMocks()).toEqual([]);
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test("uses the real googleapis client to request the current 200-message chat view", async () => {
    const scope = nock(youtubeApiOrigin, {
      reqheaders: {
        authorization: "Bearer test-access-token"
      }
    })
      .get("/youtube/v3/liveChat/messages")
      .query({
        liveChatId: "live-chat-1",
        part: ["id", "snippet", "authorDetails"],
        maxResults: "200",
        hl: "ja"
      })
      .reply(200, {
        items: [
          {
            id: "message-1",
            snippet: {
              type: "textMessageEvent",
              publishedAt: "2026-05-20T12:00:00.000Z",
              displayMessage: "hello",
              textMessageDetails: { messageText: "hello" }
            },
            authorDetails: {
              channelId: "channel-1",
              displayName: "Viewer"
            }
          },
          {
            id: "message-2",
            snippet: {
              type: "tombstone",
              publishedAt: "2026-05-20T12:00:01.000Z"
            }
          }
        ]
      });

    const result = await getLiveChatSnapshot("live-chat-1");

    expect(scope.isDone()).toBe(true);
    expect(result.messages).toMatchObject([{ platformMessageId: "message-1", messageText: "hello" }]);
    expect(result.deletions).toEqual([
      {
        targetPlatformMessageId: "message-2",
        deletionStatus: "deleted",
        deletedAt: "2026-05-20T12:00:01.000Z"
      }
    ]);
  });

  test("propagates a real YouTube HTTP failure without treating it as an empty snapshot", async () => {
    nock(youtubeApiOrigin)
      .get("/youtube/v3/liveChat/messages")
      .query(true)
      .reply(403, {
        error: {
          code: 403,
          message: "The request cannot be completed because you have exceeded your quota.",
          errors: [{ reason: "quotaExceeded" }]
        }
      });

    await expect(getLiveChatSnapshot("live-chat-1")).rejects.toMatchObject({ code: 403 });
  });
});
