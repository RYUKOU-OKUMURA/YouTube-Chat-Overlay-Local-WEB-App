import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  YouTubeStreamParserError,
  YouTubeStreamResponseShapeError,
  classifyYouTubeError,
  getLiveChatInfo
} from "@/server/youtube/api";

const mocks = vi.hoisted(() => ({
  getAuthorizedClient: vi.fn(),
  googleYoutube: vi.fn(),
  videosList: vi.fn()
}));

vi.mock("@/server/youtube/oauth", () => ({
  getAuthorizedClient: mocks.getAuthorizedClient
}));

vi.mock("googleapis", () => ({
  google: {
    youtube: mocks.googleYoutube
  }
}));

describe("classifyYouTubeError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedClient.mockResolvedValue({ auth: true });
    mocks.googleYoutube.mockReturnValue({
      videos: {
        list: mocks.videosList
      }
    });
  });

  test("maps invalid_grant to unauthorized", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 400,
          data: {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked."
          }
        }
      })
    ).toMatchObject({
      kind: "unauthorized",
      action: expect.stringContaining("YouTube連携"),
      retryable: false
    });
  });

  test("maps HTTP 401 to unauthorized", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 401,
          data: {
            error: {
              message: "Unauthorized"
            }
          }
        }
      })
    ).toMatchObject({
      kind: "unauthorized",
      retryable: false
    });
  });

  test("maps HTTP 403 permission and scope errors to permissionDenied", () => {
    expect(
      classifyYouTubeError({
        response: {
          status: 403,
          data: {
            error: {
              errors: [{ reason: "insufficientPermissions" }],
              message: "Request had insufficient authentication scopes."
            }
          }
        }
      })
    ).toMatchObject({
      kind: "permissionDenied",
      action: expect.stringContaining("必要な権限"),
      retryable: false
    });
  });

  test("does not retry merely because an error mentions stream", () => {
    expect(classifyYouTubeError(new Error("stream response had an unexpected payload"))).toMatchObject({
      kind: "unknown",
      retryable: false
    });
  });

  test("retries clear transport, network, and 5xx errors", () => {
    expect(classifyYouTubeError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))).toMatchObject({
      kind: "network",
      reason: "ECONNRESET",
      retryable: true
    });
    expect(
      classifyYouTubeError({
        response: {
          status: 503,
          data: {
            error: {
              message: "Backend Error"
            }
          }
        }
      })
    ).toMatchObject({
      kind: "network",
      retryable: true
    });
  });

  test("treats parser and response shape errors as terminal", () => {
    expect(classifyYouTubeError(new YouTubeStreamParserError())).toMatchObject({
      kind: "parser",
      phase: "stream",
      retryable: false
    });
    expect(classifyYouTubeError(new YouTubeStreamResponseShapeError())).toMatchObject({
      kind: "responseShape",
      phase: "stream",
      retryable: false
    });
  });
});

describe("getLiveChatInfo diagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedClient.mockResolvedValue({ auth: true });
    mocks.googleYoutube.mockReturnValue({
      videos: {
        list: mocks.videosList
      }
    });
  });

  test("diagnoses missing or inaccessible videos", async () => {
    mocks.videosList.mockResolvedValue({ data: { items: [] } });

    await expect(getLiveChatInfo("missing-video")).rejects.toMatchObject({
      kind: "videoNotFound",
      reason: "video_not_found_or_inaccessible",
      phase: "liveChatInfo",
      retryable: false
    });
  });

  test("diagnoses upcoming broadcasts with timing", async () => {
    mocks.videosList.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              liveBroadcastContent: "upcoming"
            },
            liveStreamingDetails: {
              scheduledStartTime: "2026-04-28T12:00:00.000Z"
            }
          }
        ]
      }
    });

    await expect(getLiveChatInfo("upcoming-video")).rejects.toMatchObject({
      kind: "liveNotStarted",
      scheduledStartTime: "2026-04-28T12:00:00.000Z"
    });
  });

  test("diagnoses ended broadcasts with actualEndTime", async () => {
    mocks.videosList.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              liveBroadcastContent: "none"
            },
            liveStreamingDetails: {
              actualStartTime: "2026-04-28T11:00:00.000Z",
              actualEndTime: "2026-04-28T12:00:00.000Z"
            }
          }
        ]
      }
    });

    await expect(getLiveChatInfo("ended-video")).rejects.toMatchObject({
      kind: "liveEnded",
      actualEndTime: "2026-04-28T12:00:00.000Z"
    });
  });

  test("diagnoses non-live videos", async () => {
    mocks.videosList.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              liveBroadcastContent: "none"
            }
          }
        ]
      }
    });

    await expect(getLiveChatInfo("normal-video")).rejects.toMatchObject({
      kind: "notLiveBroadcast",
      reason: "not_live_broadcast"
    });
  });

  test("diagnoses live broadcasts with missing active chat", async () => {
    mocks.videosList.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              liveBroadcastContent: "live"
            },
            liveStreamingDetails: {
              actualStartTime: "2026-04-28T11:00:00.000Z"
            }
          }
        ]
      }
    });

    await expect(getLiveChatInfo("chat-disabled-video")).rejects.toMatchObject({
      kind: "liveChatDisabled",
      actualStartTime: "2026-04-28T11:00:00.000Z"
    });
  });

  test("returns active chat info and timing fields for live broadcasts", async () => {
    mocks.videosList.mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              title: "Test live",
              channelTitle: "Test channel",
              liveBroadcastContent: "live"
            },
            liveStreamingDetails: {
              activeLiveChatId: "live-chat-1",
              scheduledStartTime: "2026-04-28T10:30:00.000Z",
              actualStartTime: "2026-04-28T11:00:00.000Z"
            }
          }
        ]
      }
    });

    await expect(getLiveChatInfo("live-video")).resolves.toMatchObject({
      videoId: "live-video",
      liveChatId: "live-chat-1",
      streamTitle: "Test live",
      channelName: "Test channel",
      scheduledStartTime: "2026-04-28T10:30:00.000Z",
      actualStartTime: "2026-04-28T11:00:00.000Z"
    });
  });
});
