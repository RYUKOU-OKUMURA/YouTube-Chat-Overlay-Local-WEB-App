import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ChatMessage } from "@/types";

const mocks = vi.hoisted(() => ({
  getLiveChatInfo: vi.fn(),
  getViewerMetrics: vi.fn(),
  getLiveChatSnapshot: vi.fn(),
  streamLiveChatMessages: vi.fn(),
  classifyYouTubeError: vi.fn(),
  readSettings: vi.fn(),
  patchSettings: vi.fn(),
  getYouTubeStatus: vi.fn()
}));

vi.mock("@/server/youtube/api", () => ({
  getLiveChatInfo: mocks.getLiveChatInfo,
  getViewerMetrics: mocks.getViewerMetrics,
  getLiveChatSnapshot: mocks.getLiveChatSnapshot,
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

const settings = { theme: {} };

function chatMessage(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    platformMessageId: id,
    authorName: "Viewer",
    authorChannelId: "viewer-channel",
    messageText: id,
    messageType: "textMessageEvent",
    isMember: false,
    isModerator: false,
    isOwner: false,
    isSuperChat: false,
    publishedAt: "2026-05-20T12:00:00.000Z",
    ...overrides
  };
}

function snapshot(messages: ChatMessage[], options: { saturated?: boolean; deletions?: unknown[] } = {}) {
  return {
    messages,
    deletions: options.deletions ?? [],
    saturated: options.saturated ?? false
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function startWithMessages(messages: ChatMessage[]) {
  mocks.streamLiveChatMessages.mockImplementation(async function* () {
    yield { messages, deletions: [], nextPageToken: "resume-token" };
    await new Promise(() => undefined);
  });

  const { AppController } = await import("@/server/state/appController");
  const controller = new AppController();
  await controller.startBroadcast({ broadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  await vi.waitFor(async () => expect((await controller.getMessages()).length).toBe(messages.length));
  return controller;
}

describe("single-comment display validation", () => {
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
      concurrentViewers: 12,
      checkedAt: "2026-05-20T12:00:00.000Z",
      status: "available"
    });
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([]));
    mocks.classifyYouTubeError.mockReturnValue({ kind: "unknown", message: "stream failed", retryable: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("shows a manually selected comment only after the current list confirms it", async () => {
    const first = chatMessage("first");
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([first]));
    const controller = await startWithMessages([first]);

    const overlay = await controller.showMessage(first.id);

    expect(mocks.getLiveChatSnapshot).toHaveBeenCalledWith("live-chat-1");
    expect(overlay.currentMessage).toMatchObject({ id: first.id, displayedAt: expect.any(String) });
    expect((await controller.getMessages())[0]).toMatchObject({ id: first.id, displayedAt: expect.any(String) });
    await controller.stopBroadcast();
  });

  test("does not display an absent candidate and marks it deleted when the view is not saturated", async () => {
    const first = chatMessage("first");
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([]));
    const controller = await startWithMessages([first]);

    await expect(controller.showMessage(first.id)).rejects.toThrow("確認できない");

    expect((await controller.getMessages())[0]).toMatchObject({
      id: first.id,
      deletionStatus: "deleted",
      messageText: "このコメントは削除されました。"
    });
    expect((await controller.getState()).overlay.currentMessage).toBeNull();
    await controller.stopBroadcast();
  });

  test("fails closed without marking deletion when a saturated list cannot verify a candidate", async () => {
    const first = chatMessage("first");
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([], { saturated: true }));
    const controller = await startWithMessages([first]);

    await expect(controller.showMessage(first.id)).rejects.toThrow("確認できない");

    expect((await controller.getMessages())[0]).toMatchObject({ id: first.id, messageText: first.messageText });
    expect((await controller.getMessages())[0]?.deletionStatus).toBeUndefined();
    await controller.stopBroadcast();
  });

  test("skips a missing Next candidate, marks it deleted, and displays the following valid candidate", async () => {
    const first = chatMessage("first", { publishedAt: "2026-05-20T12:00:00.000Z" });
    const second = chatMessage("second", { publishedAt: "2026-05-20T12:00:01.000Z" });
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([second]));
    const controller = await startWithMessages([first, second]);

    const overlay = await controller.showNextMessage();

    expect(overlay.currentMessage?.id).toBe(second.id);
    expect((await controller.getMessages()).find((message) => message.id === first.id)).toMatchObject({
      deletionStatus: "deleted"
    });
    await controller.stopBroadcast();
  });

  test("removes a manually displayed candidate from Next so it is not shown twice", async () => {
    const first = chatMessage("first", { publishedAt: "2026-05-20T12:00:00.000Z" });
    const second = chatMessage("second", { publishedAt: "2026-05-20T12:00:01.000Z" });
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([first, second]));
    const controller = await startWithMessages([first, second]);

    await controller.showMessage(first.id);
    const overlay = await controller.showNextMessage();

    expect(overlay.currentMessage?.id).toBe(second.id);
    await controller.stopBroadcast();
  });

  test("keeps the Next candidate when list retrieval fails, allowing a later retry", async () => {
    const first = chatMessage("first");
    mocks.getLiveChatSnapshot
      .mockRejectedValueOnce(new Error("temporary list failure"))
      .mockResolvedValueOnce(snapshot([first]));
    const controller = await startWithMessages([first]);

    await expect(controller.showNextMessage()).rejects.toThrow("temporary list failure");
    expect((await controller.getState()).overlay.currentMessage).toBeNull();

    const overlay = await controller.showNextMessage();
    expect(overlay.currentMessage?.id).toBe(first.id);
    await controller.stopBroadcast();
  });

  test("keeps an already displayed comment visible when a later display check discovers its tombstone", async () => {
    const first = chatMessage("first", { publishedAt: "2026-05-20T12:00:00.000Z" });
    const second = chatMessage("second", { publishedAt: "2026-05-20T12:00:01.000Z" });
    mocks.getLiveChatSnapshot
      .mockResolvedValueOnce(snapshot([first, second]))
      .mockResolvedValueOnce(
        snapshot([second], {
          deletions: [
            {
              targetPlatformMessageId: first.platformMessageId,
              deletionStatus: "deleted",
              deletedAt: "2026-05-20T12:01:00.000Z"
            }
          ]
        })
      );
    const controller = await startWithMessages([first, second]);
    const hideEvents: unknown[] = [];
    controller.events.on("overlay:hide", (state) => hideEvents.push(state));

    await controller.showMessage(first.id);
    await controller.showMessage(second.id);

    const messages = await controller.getMessages();
    expect(messages.find((message) => message.id === first.id)).toMatchObject({ deletionStatus: "deleted" });
    expect((await controller.getState()).overlay.currentMessage?.id).toBe(second.id);
    expect(hideEvents).toEqual([]);
    await controller.stopBroadcast();
  });

  test("does not enqueue non-display chat events for Next", async () => {
    const ended = chatMessage("ended", { messageType: "chatEndedEvent" });
    const valid = chatMessage("valid", { publishedAt: "2026-05-20T12:00:01.000Z" });
    mocks.getLiveChatSnapshot.mockResolvedValue(snapshot([valid]));
    const controller = await startWithMessages([ended, valid]);

    const overlay = await controller.showNextMessage();

    expect(overlay.currentMessage?.id).toBe(valid.id);
    await controller.stopBroadcast();
  });

  test("rejects a stale snapshot that finishes after the broadcast is stopped", async () => {
    const first = chatMessage("first");
    const delayedSnapshot = deferred<ReturnType<typeof snapshot>>();
    mocks.getLiveChatSnapshot.mockReturnValueOnce(delayedSnapshot.promise);
    const controller = await startWithMessages([first]);

    const pendingDisplay = controller.showMessage(first.id);
    await vi.waitFor(() => expect(mocks.getLiveChatSnapshot).toHaveBeenCalledTimes(1));
    await controller.stopBroadcast();
    delayedSnapshot.resolve(snapshot([first]));

    await expect(pendingDisplay).rejects.toThrow("取得対象が切り替わった");
    expect((await controller.getState()).overlay.currentMessage).toBeNull();
  });

  test("serializes simultaneous Next actions so candidates are displayed in order", async () => {
    const first = chatMessage("first", { publishedAt: "2026-05-20T12:00:00.000Z" });
    const second = chatMessage("second", { publishedAt: "2026-05-20T12:00:01.000Z" });
    const firstSnapshot = deferred<ReturnType<typeof snapshot>>();
    mocks.getLiveChatSnapshot
      .mockReturnValueOnce(firstSnapshot.promise)
      .mockResolvedValueOnce(snapshot([first, second]));
    const controller = await startWithMessages([first, second]);

    const nextOne = controller.showNextMessage();
    const nextTwo = controller.showNextMessage();
    firstSnapshot.resolve(snapshot([first, second]));

    expect((await nextOne).currentMessage?.id).toBe(first.id);
    expect((await nextTwo).currentMessage?.id).toBe(second.id);
    expect(mocks.getLiveChatSnapshot).toHaveBeenCalledTimes(2);
    await controller.stopBroadcast();
  });
});
