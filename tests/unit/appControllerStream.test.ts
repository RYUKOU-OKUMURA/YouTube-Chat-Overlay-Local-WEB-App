import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChatMessage } from "@/types";

const mocks = vi.hoisted(() => ({
  getLiveChatInfo: vi.fn(),
  streamLiveChatMessages: vi.fn(),
  classifyYouTubeError: vi.fn(),
  readSettings: vi.fn(),
  patchSettings: vi.fn(),
  getYouTubeStatus: vi.fn()
}));

vi.mock("@/server/youtube/api", () => ({
  getLiveChatInfo: mocks.getLiveChatInfo,
  streamLiveChatMessages: mocks.streamLiveChatMessages,
  classifyYouTubeError: mocks.classifyYouTubeError
}));

vi.mock("@/server/settings/settingsStore", () => ({
  readSettings: mocks.readSettings,
  patchSettings: mocks.patchSettings
}));

vi.mock("@/server/youtube/oauth", () => ({
  getYouTubeStatus: mocks.getYouTubeStatus
}));

const settings = {
  overlayToken: "test-overlay-token",
  theme: {}
};

const message = (id: string): ChatMessage => ({
  id,
  platformMessageId: id,
  authorName: "Viewer",
  messageText: `message ${id}`,
  messageType: "textMessageEvent",
  isMember: false,
  isModerator: false,
  isOwner: false,
  isSuperChat: false,
  publishedAt: "2026-04-27T12:00:00.000Z"
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("AppController stream lifecycle", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.readSettings.mockResolvedValue(settings);
    mocks.patchSettings.mockImplementation(async (patch) => ({ ...settings, ...patch }));
    mocks.getYouTubeStatus.mockResolvedValue({ oauth: "authorized", api: "connected" });
    mocks.getLiveChatInfo.mockResolvedValue({
      videoId: "dQw4w9WgXcQ",
      liveChatId: "live-chat-1",
      streamTitle: "Test stream",
      channelName: "Test channel"
    });
    mocks.classifyYouTubeError.mockImplementation((error: unknown) => {
      const classified = (error as { classified?: unknown }).classified;
      return classified ?? { kind: "unknown", message: "stream failed", retryable: false };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("ignores stale stream messages after stop", async () => {
    const gate = deferred();
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await gate.promise;
      yield { messages: [message("stale-message")], nextPageToken: "token-1" };
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await controller.stopBroadcast();
    gate.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    expect(await controller.getMessages()).toEqual([]);
    expect((await controller.getState()).broadcastStatus).toMatchObject({
      isFetchingComments: false,
      connectionState: "stopped"
    });
  });

  test("reconnects with the latest nextPageToken after stream close", async () => {
    vi.useFakeTimers();
    const calls: Array<{ pageToken?: string }> = [];
    mocks.streamLiveChatMessages.mockImplementation(async function* (input: { pageToken?: string }) {
      calls.push(input);
      if (calls.length === 1) {
        yield { messages: [message("first")], nextPageToken: "token-1" };
        return;
      }
      yield { messages: [message("second")], nextPageToken: "token-2" };
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(calls).toHaveLength(2));

    expect(calls[1].pageToken).toBe("token-1");
    expect((await controller.getMessages()).map((item) => item.id)).toContain("second");
    await controller.stopBroadcast();
  });

  test("marks quota errors as terminal stream errors", async () => {
    const quotaError = {
      classified: {
        kind: "quotaExceeded",
        message: "YouTube API quota has been exceeded.",
        retryable: false
      }
    };
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      throw quotaError;
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: false,
        connectionState: "error",
        error: "YouTube API quota has been exceeded."
      });
    });
  });

  test("marks live chat ended errors as ended", async () => {
    const endedError = {
      classified: {
        kind: "liveChatEnded",
        message: "The YouTube live chat has ended.",
        retryable: false
      }
    };
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      throw endedError;
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: false,
        connectionState: "ended",
        error: "The YouTube live chat has ended."
      });
    });
  });
});
