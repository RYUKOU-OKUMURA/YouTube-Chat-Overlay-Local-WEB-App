import { describe, expect, test, vi, beforeEach } from "vitest";
import { YouTubeDiagnosticError, YouTubeStreamParserError } from "@/server/youtube/api";

const mocks = vi.hoisted(() => ({
  startBroadcast: vi.fn()
}));

vi.mock("@/server/state/appController", () => ({
  appController: {
    startBroadcast: mocks.startBroadcast
  }
}));

function requestWithBody(body: unknown) {
  return new Request("http://localhost/api/broadcast/start", {
    method: "POST",
    body: JSON.stringify(body)
  }) as never;
}

function requestWithRawBody(body: string) {
  return new Request("http://localhost/api/broadcast/start", {
    method: "POST",
    body
  }) as never;
}

async function postStart(body: unknown) {
  const { POST } = await import("@/app/api/broadcast/start/route");
  return POST(requestWithBody(body));
}

describe("broadcast start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("maps upcoming live diagnosis to LIVE_NOT_STARTED", async () => {
    mocks.startBroadcast.mockRejectedValue(
      new YouTubeDiagnosticError({
        kind: "liveNotStarted",
        message: "このYouTubeライブはまだ開始されていません。",
        reason: "live_broadcast_not_started",
        phase: "liveChatInfo",
        action: "配信開始後にもう一度コメント取得を開始してください。",
        status: 409,
        scheduledStartTime: "2026-04-28T12:00:00.000Z"
      })
    );

    const response = await postStart({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "LIVE_NOT_STARTED",
        message: "このYouTubeライブはまだ開始されていません。 配信開始後にもう一度コメント取得を開始してください。"
      }
    });
  });

  test("maps permission diagnosis to YOUTUBE_PERMISSION_DENIED", async () => {
    mocks.startBroadcast.mockRejectedValue(
      new YouTubeDiagnosticError({
        kind: "permissionDenied",
        message: "YouTube APIの権限が不足しています。",
        reason: "insufficientPermissions",
        phase: "request",
        action: "YouTube連携を解除して再接続し、必要な権限を許可してください。",
        status: 403
      })
    );

    const response = await postStart({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "YOUTUBE_PERMISSION_DENIED",
        message: expect.stringContaining("必要な権限")
      }
    });
  });

  test("maps terminal parser errors to YOUTUBE_RESPONSE_ERROR", async () => {
    mocks.startBroadcast.mockRejectedValue(new YouTubeStreamParserError());

    const response = await postStart({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "YOUTUBE_RESPONSE_ERROR",
        message: expect.stringContaining("コメント取得を停止しました")
      }
    });
  });

  test("returns shaped validation errors for malformed JSON", async () => {
    const { POST } = await import("@/app/api/broadcast/start/route");

    const response = await POST(requestWithRawBody("{"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Malformed JSON body."
      }
    });
    expect(mocks.startBroadcast).not.toHaveBeenCalled();
  });

  test("returns shaped validation errors for empty bodies", async () => {
    const { POST } = await import("@/app/api/broadcast/start/route");

    const response = await POST(requestWithRawBody(""));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body is required."
      }
    });
    expect(mocks.startBroadcast).not.toHaveBeenCalled();
  });
});
