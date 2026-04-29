import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChatMessage } from "@/types";

const mocks = vi.hoisted(() => ({
  getLiveChatInfo: vi.fn(),
  getViewerMetrics: vi.fn(),
  streamLiveChatMessages: vi.fn(),
  classifyYouTubeError: vi.fn(),
  readSettings: vi.fn(),
  patchSettings: vi.fn(),
  getYouTubeStatus: vi.fn()
}));

vi.mock("@/server/youtube/api", () => ({
  getLiveChatInfo: mocks.getLiveChatInfo,
  getViewerMetrics: mocks.getViewerMetrics,
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

const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  platformMessageId: id,
  authorName: "Viewer",
  messageText: `message ${id}`,
  messageType: "textMessageEvent",
  isMember: false,
  isModerator: false,
  isOwner: false,
  isSuperChat: false,
  publishedAt: "2026-04-27T12:00:00.000Z",
  ...overrides
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
      channelName: "Test channel",
      concurrentViewers: 12
    });
    mocks.getViewerMetrics.mockResolvedValue({
      concurrentViewers: 34,
      checkedAt: "2026-04-27T12:03:00.000Z",
      status: "available"
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
    await vi.advanceTimersByTimeAsync(2000);
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
        errorKind: "quotaExceeded",
        errorPhase: "stream",
        error: "YouTube API quota has been exceeded."
      });
    });
  });

  test("reconnects after truncated stream JSON responses", async () => {
    vi.useFakeTimers();
    const calls: Array<{ pageToken?: string }> = [];
    const truncatedError = {
      classified: {
        kind: "network",
        message: "YouTubeライブチャットのJSON応答が途中で終了しました。",
        retryable: true,
        reason: "incomplete_stream_json",
        phase: "stream",
        action: "YouTube側または通信経路でストリームが途中切断されました。自動で再接続します。"
      }
    };
    mocks.streamLiveChatMessages.mockImplementation(async function* (input: { pageToken?: string }) {
      calls.push(input);
      if (calls.length === 1) {
        throw truncatedError;
      }
      yield { messages: [message("after-truncated-json")], nextPageToken: "token-after-truncated-json" };
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: true,
        connectionState: "reconnecting",
        errorKind: "network",
        errorReason: "incomplete_stream_json",
        error: "YouTubeライブチャットのJSON応答が途中で終了しました。"
      });
    });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect((await controller.getMessages()).map((item) => item.id)).toContain("after-truncated-json");
    await controller.stopBroadcast();
  });

  test("does not reconnect terminal parser errors", async () => {
    vi.useFakeTimers();
    const parserError = {
      classified: {
        kind: "parser",
        message: "YouTubeライブチャットのJSON応答を解析できませんでした。",
        retryable: false,
        reason: "invalid_stream_json",
        phase: "stream",
        action: "コメント取得を停止しました。"
      }
    };
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      throw parserError;
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: false,
        connectionState: "error",
        errorKind: "parser",
        errorReason: "invalid_stream_json",
        errorAction: "コメント取得を停止しました。"
      });
    });

    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.streamLiveChatMessages).toHaveBeenCalledTimes(1);
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
        errorKind: "liveChatEnded",
        errorPhase: "stream",
        error: "The YouTube live chat has ended."
      });
    });
  });

  test("deduplicates concurrent starts for the same video", async () => {
    const liveChatInfo = deferred<{
      videoId: string;
      liveChatId: string;
      streamTitle: string;
      channelName: string;
    }>();
    mocks.getLiveChatInfo.mockReturnValue(liveChatInfo.promise);
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    const firstStart = controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const secondStart = controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(mocks.getLiveChatInfo).toHaveBeenCalledTimes(1));

    liveChatInfo.resolve({
      videoId: "dQw4w9WgXcQ",
      liveChatId: "live-chat-1",
      streamTitle: "Test stream",
      channelName: "Test channel"
    });
    const [firstStatus, secondStatus] = await Promise.all([firstStart, secondStart]);

    expect(firstStatus).toBe(secondStatus);
    expect(mocks.getLiveChatInfo).toHaveBeenCalledTimes(1);
    expect(mocks.streamLiveChatMessages).toHaveBeenCalledTimes(1);
    await controller.stopBroadcast();
  });

  test("does not let an older start overwrite a newer stream", async () => {
    const firstInfo = deferred<{
      videoId: string;
      liveChatId: string;
      streamTitle: string;
      channelName: string;
    }>();
    mocks.getLiveChatInfo.mockImplementation((videoId: string) => {
      if (videoId === "dQw4w9WgXcQ") {
        return firstInfo.promise;
      }
      return Promise.resolve({
        videoId,
        liveChatId: "live-chat-new",
        streamTitle: "New stream",
        channelName: "New channel"
      });
    });
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    const oldStart = controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(mocks.getLiveChatInfo).toHaveBeenCalledWith("dQw4w9WgXcQ"));
    const newStart = controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });

    firstInfo.resolve({
      videoId: "dQw4w9WgXcQ",
      liveChatId: "live-chat-old",
      streamTitle: "Old stream",
      channelName: "Old channel"
    });
    await oldStart;
    const newStatus = await newStart;

    expect(newStatus).toMatchObject({
      currentVideoId: "aaaaaaaaaaa",
      liveChatId: "live-chat-new",
      connectionState: "connecting"
    });
    expect(mocks.streamLiveChatMessages).toHaveBeenCalledTimes(1);
    expect(mocks.streamLiveChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({ liveChatId: "live-chat-new" })
    );
    await controller.stopBroadcast();
  });

  test("stops after five consecutive short stream closes", async () => {
    vi.useFakeTimers();
    const calls: Array<{ pageToken?: string }> = [];
    mocks.streamLiveChatMessages.mockImplementation(async function* (input: { pageToken?: string }) {
      calls.push(input);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    for (const [index, delay] of [2000, 4000, 8000, 16000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      await vi.waitFor(() => expect(calls).toHaveLength(index + 2));
    }

    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: false,
        connectionState: "error",
        errorKind: "network",
        errorReason: "short_stream_close_limit",
        error: "YouTubeライブチャットのストリーム接続が短時間で繰り返し終了しました。"
      });
    });
    expect(calls).toHaveLength(5);
  });

  test("limits reconnects to eight attempts", async () => {
    vi.useFakeTimers();
    const calls: Array<{ pageToken?: string }> = [];
    mocks.streamLiveChatMessages.mockImplementation(async function* (input: { pageToken?: string }) {
      calls.push(input);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    const reconnectTimeline = [
      5000, 2000, 5000, 4000, 5000, 8000, 5000, 16000, 5000, 32000, 5000, 60000, 5000, 60000, 5000,
      60000, 5000
    ];
    for (const delay of reconnectTimeline) {
      await vi.advanceTimersByTimeAsync(delay);
    }

    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus).toMatchObject({
        isFetchingComments: false,
        connectionState: "error",
        reconnectAttempt: 8,
        maxReconnectAttempts: 8,
        errorKind: "network",
        errorReason: "max_reconnect_attempts_exceeded",
        error: "YouTubeライブチャットへ再接続できませんでした。"
      });
    });
    expect(calls).toHaveLength(9);
  });

  test("resets reconnect counters and delay only after a stable stream", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
    const calls: Array<{ pageToken?: string }> = [];
    const statuses: Array<{
      emittedAt: number;
      reconnectAttempt?: number;
      nextReconnectAt?: string;
      connectionState?: string;
    }> = [];
    mocks.streamLiveChatMessages.mockImplementation(async function* (input: { pageToken?: string }) {
      calls.push(input);
      if (calls.length === 2) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        yield { messages: [message("after-reconnect")], nextPageToken: "token-after-reconnect" };
      }
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();
    controller.events.on("broadcast:status", (status) => {
      statuses.push({
        emittedAt: Date.now(),
        reconnectAttempt: status.reconnectAttempt,
        nextReconnectAt: status.nextReconnectAt,
        connectionState: status.connectionState
      });
    });

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(statuses).toContainEqual(expect.objectContaining({ connectionState: "connected" })));

    const connectedStatus = statuses.find((status) => status.connectionState === "connected");
    expect(connectedStatus).toMatchObject({ reconnectAttempt: 0, nextReconnectAt: undefined });

    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    const connectedIndex = statuses.findIndex((status) => status.connectionState === "connected");
    const resetReconnectStatus = statuses
      .slice(connectedIndex + 1)
      .find((status) => status.connectionState === "reconnecting" && status.reconnectAttempt === 1);
    expect(resetReconnectStatus?.nextReconnectAt).toBeDefined();
    expect(Date.parse(resetReconnectStatus!.nextReconnectAt!) - resetReconnectStatus!.emittedAt).toBe(2000);
    await controller.stopBroadcast();
  });

  test("retains capped messages by importance while keeping newest-first order", async () => {
    const displayedAt = "2026-04-27T12:00:01.000Z";
    const displayedNormals = Array.from({ length: 301 }, (_, index) =>
      message(`displayed-normal-${index}`, { displayedAt })
    );
    const batch = [
      message("undisplayed-super-chat", { isSuperChat: true }),
      message("undisplayed-owner", { isOwner: true }),
      message("undisplayed-normal"),
      message("displayed-member", { isMember: true, displayedAt }),
      ...displayedNormals
    ];
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      yield { messages: batch, nextPageToken: "token-1" };
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => expect(await controller.getMessages()).toHaveLength(300));

    const retainedIds = (await controller.getMessages()).map((item) => item.id);
    expect(retainedIds).toContain("undisplayed-super-chat");
    expect(retainedIds).toContain("undisplayed-owner");
    expect(retainedIds).toContain("undisplayed-normal");
    expect(retainedIds).toContain("displayed-member");
    expect(retainedIds).toContain("displayed-normal-300");
    expect(retainedIds).not.toContain("displayed-normal-0");
    expect(retainedIds).not.toContain("displayed-normal-1");
    expect(retainedIds.indexOf("displayed-normal-300")).toBeLessThan(retainedIds.indexOf("displayed-normal-299"));
    expect(retainedIds.indexOf("displayed-normal-299")).toBeLessThan(retainedIds.indexOf("displayed-normal-298"));
    await controller.stopBroadcast();
  });

  test("refreshes viewer metrics every three minutes and stops after stop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    const startStatus = await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(startStatus.viewerMetrics).toMatchObject({
      concurrentViewers: 12,
      status: "available",
      intervalSeconds: 180
    });
    expect(mocks.getViewerMetrics).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(180000);
    await vi.waitFor(() => expect(mocks.getViewerMetrics).toHaveBeenCalledTimes(1));
    expect((await controller.getState()).broadcastStatus.viewerMetrics).toMatchObject({
      concurrentViewers: 34,
      checkedAt: "2026-04-27T12:03:00.000Z",
      status: "available"
    });

    await controller.stopBroadcast();
    await vi.advanceTimersByTimeAsync(180000);
    expect(mocks.getViewerMetrics).toHaveBeenCalledTimes(1);
  });

  test("reuses current viewer metrics during manual refresh cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    const startStatus = await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    const refreshStatus = await controller.refreshViewerMetrics();

    expect(refreshStatus).toBe(startStatus);
    expect(mocks.getViewerMetrics).not.toHaveBeenCalled();
    await controller.stopBroadcast();
  });

  test("keeps viewer metrics errors out of the comment stream lifecycle", async () => {
    vi.useFakeTimers();
    mocks.getViewerMetrics.mockRejectedValue(new Error("viewer metrics failed"));
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      yield { messages: [message("still-live")], nextPageToken: "token-1" };
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => expect(await controller.getMessages()).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(180000);
    await vi.waitFor(async () => {
      expect((await controller.getState()).broadcastStatus.viewerMetrics).toMatchObject({
        status: "error",
        message: "viewer metrics failed"
      });
    });
    expect((await controller.getState()).broadcastStatus).toMatchObject({
      isFetchingComments: true,
      connectionState: "connected"
    });
    await controller.stopBroadcast();
  });

  test("deduplicates manual viewer metric refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00.000Z"));
    const metrics = deferred<{
      concurrentViewers: number;
      checkedAt: string;
      status: "available";
    }>();
    mocks.getViewerMetrics.mockReturnValue(metrics.promise);
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    vi.setSystemTime(new Date("2026-04-27T12:03:01.000Z"));
    const firstRefresh = controller.refreshViewerMetrics();
    const secondRefresh = controller.refreshViewerMetrics();
    await vi.waitFor(() => expect(mocks.getViewerMetrics).toHaveBeenCalledTimes(1));
    metrics.resolve({
      concurrentViewers: 56,
      checkedAt: "2026-04-27T12:01:00.000Z",
      status: "available"
    });

    const [firstStatus, secondStatus] = await Promise.all([firstRefresh, secondRefresh]);
    expect(firstStatus).toBe(secondStatus);
    expect(firstStatus.viewerMetrics).toMatchObject({ concurrentViewers: 56 });
    await controller.stopBroadcast();
  });

  test("retains up to one hundred super chats and clears them on new broadcast start", async () => {
    const superChatBatch = Array.from({ length: 101 }, (_, index) =>
      message(`super-chat-${index}`, {
        isSuperChat: true,
        amountText: `¥${index + 1}`
      })
    );
    const normal = message("normal-message");
    let streamIndex = 0;
    mocks.streamLiveChatMessages.mockImplementation(async function* () {
      streamIndex += 1;
      if (streamIndex === 1) {
        yield { messages: [normal, ...superChatBatch], nextPageToken: "token-1" };
      }
      await new Promise(() => undefined);
    });

    const { AppController } = await import("@/server/state/appController");
    const controller = new AppController();

    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    await vi.waitFor(async () => expect((await controller.getState()).superChats).toHaveLength(100));
    const retainedIds = (await controller.getState()).superChats.map((item) => item.id);
    expect(retainedIds).toContain("super-chat-100");
    expect(retainedIds).not.toContain("super-chat-0");
    expect(retainedIds).not.toContain("normal-message");

    mocks.getLiveChatInfo.mockResolvedValueOnce({
      videoId: "aaaaaaaaaaa",
      liveChatId: "live-chat-2",
      streamTitle: "Second stream",
      channelName: "Test channel"
    });
    await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa" });
    expect((await controller.getState()).superChats).toEqual([]);
    await controller.stopBroadcast();
  });
});
