import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stopBroadcast: vi.fn(),
  refreshYouTubeStatus: vi.fn(),
  disconnectYouTube: vi.fn()
}));

vi.mock("@/server/state/appController", () => ({
  appController: {
    stopBroadcast: mocks.stopBroadcast,
    refreshYouTubeStatus: mocks.refreshYouTubeStatus
  }
}));

vi.mock("@/server/youtube/oauth", () => ({
  disconnectYouTube: mocks.disconnectYouTube
}));

describe("YouTube disconnect route", () => {
  test("stops the active broadcast before clearing OAuth token", async () => {
    const calls: string[] = [];
    mocks.stopBroadcast.mockImplementation(async () => {
      calls.push("stop");
    });
    mocks.disconnectYouTube.mockImplementation(async () => {
      calls.push("disconnect");
    });
    mocks.refreshYouTubeStatus.mockImplementation(async () => {
      calls.push("refresh");
      return { oauth: "unauthorized", api: "disconnected" };
    });

    const { POST } = await import("@/app/api/youtube/disconnect/route");
    const response = await POST();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { oauth: "unauthorized", api: "disconnected" }
    });
    expect(calls).toEqual(["stop", "disconnect", "refresh"]);
  });
});
