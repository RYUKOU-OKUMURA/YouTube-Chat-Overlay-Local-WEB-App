import { EventEmitter } from "node:events";
import {
  classifyYouTubeError,
  getLiveChatInfo,
  getViewerMetrics,
  streamLiveChatMessages,
  type ClassifiedYouTubeError
} from "@/server/youtube/api";
import { parseYouTubeVideoId } from "@/server/youtube/parseYouTubeUrl";
import { getYouTubeStatus } from "@/server/youtube/oauth";
import { patchSettings, readSettings } from "@/server/settings/settingsStore";
import {
  maxFetchedMessageIds,
  maxRetainedSuperChats,
  prioritizeRetainedMessages
} from "@/lib/messageRetention";
import { normalizeTheme } from "@/lib/validation";
import type {
  AppState,
  BroadcastStatus,
  ChatMessage,
  OverlayState,
  PatchSettingsInput,
  Settings,
  StartBroadcastInput,
  TestMessageInput,
  ViewerMetrics,
  YouTubeStatus
} from "@/types";

type AppEvents = {
  "state:sync": [AppState];
  "comment:new": [ChatMessage];
  "youtube:status": [YouTubeStatus];
  "broadcast:status": [BroadcastStatus];
  "overlay:show": [OverlayState];
  "overlay:hide": [OverlayState];
  "overlay:test": [OverlayState];
  "overlay:theme:update": [Settings];
  "overlay:connected": [{ connected: boolean; connectedAt?: string }];
};

class TypedEmitter extends EventEmitter {
  emit<K extends keyof AppEvents>(eventName: K, ...args: AppEvents[K]): boolean {
    return super.emit(eventName, ...args);
  }

  on<K extends keyof AppEvents>(eventName: K, listener: (...args: AppEvents[K]) => void): this {
    return super.on(eventName, listener);
  }
}

const viewerMetricsIntervalSeconds = 180;
const viewerMetricsIntervalMs = viewerMetricsIntervalSeconds * 1000;
const initialReconnectDelayMs = 2000;
const maxReconnectDelayMs = 60000;
const maxReconnectAttempts = 8;
const maxShortStreamCloses = 5;
const shortStreamCloseMs = 5000;

function clearBroadcastErrorFields(): Partial<BroadcastStatus> {
  return {
    error: undefined,
    errorKind: undefined,
    errorReason: undefined,
    errorPhase: undefined,
    errorAction: undefined
  };
}

function broadcastErrorFields(
  error: ClassifiedYouTubeError,
  fallbackPhase: NonNullable<BroadcastStatus["errorPhase"]>
): Partial<BroadcastStatus> {
  const fields: Partial<BroadcastStatus> = {
    error: error.message,
    errorKind: error.kind,
    errorReason: error.reason,
    errorPhase: error.phase ?? fallbackPhase,
    errorAction: error.action
  };
  if (error.scheduledStartTime) {
    fields.scheduledStartTime = error.scheduledStartTime;
  }
  if (error.actualStartTime) {
    fields.actualStartTime = error.actualStartTime;
  }
  if (error.actualEndTime) {
    fields.actualEndTime = error.actualEndTime;
  }
  return fields;
}

function terminalConnectionState(error: ClassifiedYouTubeError): BroadcastStatus["connectionState"] {
  return error.kind === "liveChatEnded" || error.kind === "liveEnded" ? "ended" : "error";
}

function idleViewerMetrics(): ViewerMetrics {
  return {
    intervalSeconds: viewerMetricsIntervalSeconds,
    status: "idle"
  };
}

function nextViewerMetricsRefreshAt(from = Date.now()) {
  return new Date(from + viewerMetricsIntervalMs).toISOString();
}

function viewerMetricsFromValue({
  concurrentViewers,
  checkedAt,
  nextRefreshAt
}: {
  concurrentViewers?: number;
  checkedAt: string;
  nextRefreshAt?: string;
}): ViewerMetrics {
  if (typeof concurrentViewers === "number") {
    return {
      concurrentViewers,
      checkedAt,
      nextRefreshAt,
      intervalSeconds: viewerMetricsIntervalSeconds,
      status: "available"
    };
  }

  return {
    checkedAt,
    nextRefreshAt,
    intervalSeconds: viewerMetricsIntervalSeconds,
    status: "unavailable",
    message: "視聴者数非表示または取得不可"
  };
}

export class AppController {
  readonly events = new TypedEmitter();

  private initialized = false;
  private settings!: Settings;
  private messages: ChatMessage[] = [];
  private superChats: ChatMessage[] = [];
  private fetchedMessageIds = new Set<string>();
  private fetchedMessageIdQueue: string[] = [];
  private nextPageToken: string | undefined;
  private streamAbortController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private viewerMetricsTimer: NodeJS.Timeout | null = null;
  private viewerMetricsRefreshInFlight: Promise<BroadcastStatus> | null = null;
  private streamGeneration = 0;
  private startRequestGeneration = 0;
  private startQueue: Promise<unknown> = Promise.resolve();
  private startInFlight: { videoId: string; generation: number; promise: Promise<BroadcastStatus> } | null = null;
  private reconnectDelayMs = initialReconnectDelayMs;
  private shortStreamCloseCount = 0;
  private broadcastStatus: BroadcastStatus = { isFetchingComments: false };
  private youtubeStatus: YouTubeStatus = { oauth: "unauthorized", api: "disconnected" };
  private overlayConnected = false;
  private overlayState!: OverlayState;

  async init() {
    if (this.initialized) {
      return;
    }
    this.settings = await readSettings();
    this.overlayState = {
      currentMessage: null,
      theme: this.settings.theme
    };
    this.broadcastStatus = {
      isFetchingComments: false,
      currentBroadcastUrl: this.settings.lastBroadcastUrl,
      connectionMode: "stream",
      connectionState: "stopped",
      viewerMetrics: idleViewerMetrics()
    };
    this.youtubeStatus = await getYouTubeStatus();
    this.initialized = true;
  }

  async getState(): Promise<AppState> {
    await this.init();
    return {
      overlayToken: this.settings.overlayToken,
      messages: this.messages,
      superChats: this.superChats,
      overlay: this.overlayState,
      youtubeStatus: this.youtubeStatus,
      broadcastStatus: this.broadcastStatus,
      overlayConnected: this.overlayConnected
    };
  }

  async refreshYouTubeStatus() {
    await this.init();
    this.youtubeStatus = await getYouTubeStatus();
    this.events.emit("youtube:status", this.youtubeStatus);
    await this.emitSync();
    return this.youtubeStatus;
  }

  async startBroadcast(input: StartBroadcastInput) {
    await this.init();
    const videoId = parseYouTubeVideoId(input.broadcastUrl);
    if (!videoId) {
      throw new Error("YouTube videoId could not be extracted from the URL.");
    }

    if (this.isActiveBroadcastFor(videoId)) {
      return this.broadcastStatus;
    }

    if (
      this.startInFlight?.videoId === videoId &&
      this.startInFlight.generation === this.startRequestGeneration
    ) {
      return this.startInFlight.promise;
    }

    const requestGeneration = ++this.startRequestGeneration;
    const previousStart = this.startQueue;
    const startPromise = (async () => {
      await previousStart.catch(() => undefined);

      if (requestGeneration !== this.startRequestGeneration) {
        return this.broadcastStatus;
      }

      if (this.isActiveBroadcastFor(videoId)) {
        return this.broadcastStatus;
      }

      return this.startBroadcastNow(input, videoId, requestGeneration);
    })();
    this.startQueue = startPromise.catch(() => undefined);
    this.startInFlight = { videoId, generation: requestGeneration, promise: startPromise };

    try {
      return await startPromise;
    } finally {
      if (this.startInFlight?.generation === requestGeneration) {
        this.startInFlight = null;
      }
    }
  }

  private async startBroadcastNow(input: StartBroadcastInput, videoId: string, requestGeneration: number) {
    let info: Awaited<ReturnType<typeof getLiveChatInfo>>;
    try {
      info = await getLiveChatInfo(videoId);
    } catch (error) {
      if (requestGeneration === this.startRequestGeneration && this.canPublishStartFailure(videoId)) {
        await this.publishStartFailure(input.broadcastUrl, videoId, classifyYouTubeError(error));
      }
      throw error;
    }
    if (requestGeneration !== this.startRequestGeneration) {
      return this.broadcastStatus;
    }

    const nextSettings = await patchSettings({ lastBroadcastUrl: input.broadcastUrl });
    if (requestGeneration !== this.startRequestGeneration) {
      return this.broadcastStatus;
    }

    const generation = this.resetActiveStream();
    this.nextPageToken = undefined;
    this.reconnectDelayMs = initialReconnectDelayMs;
    this.shortStreamCloseCount = 0;
    this.fetchedMessageIds.clear();
    this.fetchedMessageIdQueue = [];
    this.messages = [];
    this.superChats = [];
    this.settings = nextSettings;
    const metricsCheckedAt = new Date().toISOString();
    this.broadcastStatus = {
      isFetchingComments: true,
      connectionMode: "stream",
      connectionState: "connecting",
      reconnectAttempt: 0,
      maxReconnectAttempts,
      nextReconnectAt: undefined,
      currentBroadcastUrl: input.broadcastUrl,
      currentVideoId: info.videoId,
      liveChatId: info.liveChatId,
      streamTitle: info.streamTitle,
      channelName: info.channelName,
      scheduledStartTime: info.scheduledStartTime,
      actualStartTime: info.actualStartTime,
      actualEndTime: info.actualEndTime,
      viewerMetrics: viewerMetricsFromValue({
        concurrentViewers: info.concurrentViewers,
        checkedAt: metricsCheckedAt,
        nextRefreshAt: nextViewerMetricsRefreshAt(Date.parse(metricsCheckedAt))
      }),
      ...clearBroadcastErrorFields()
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
    this.scheduleViewerMetricsRefresh(generation);
    void this.consumeLiveChatStream(generation);
    return this.broadcastStatus;
  }

  async stopBroadcast() {
    await this.init();
    this.startRequestGeneration += 1;
    this.resetActiveStream();
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: false,
      connectionMode: "stream",
      connectionState: "stopped",
      viewerMetrics: {
        ...(this.broadcastStatus.viewerMetrics ?? idleViewerMetrics()),
        nextRefreshAt: undefined,
        status: this.broadcastStatus.viewerMetrics?.status ?? "idle"
      },
      ...clearBroadcastErrorFields()
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
    return this.broadcastStatus;
  }

  async getMessages() {
    await this.init();
    return this.messages;
  }

  async refreshViewerMetrics() {
    await this.init();
    return this.refreshViewerMetricsOnce(this.streamGeneration, true);
  }

  private refreshViewerMetricsOnce(generation: number, manual: boolean) {
    if (this.viewerMetricsRefreshInFlight) {
      return this.viewerMetricsRefreshInFlight;
    }

    this.viewerMetricsRefreshInFlight = this.refreshViewerMetricsNow(generation, manual).finally(() => {
      this.viewerMetricsRefreshInFlight = null;
    });
    return this.viewerMetricsRefreshInFlight;
  }

  private async refreshViewerMetricsNow(generation: number, manual: boolean) {
    const videoId = this.broadcastStatus.currentVideoId;
    if (!videoId || !this.isCurrentStream(generation) || !this.broadcastStatus.isFetchingComments) {
      return this.broadcastStatus;
    }
    if (manual && this.isViewerMetricsRefreshCoolingDown()) {
      return this.broadcastStatus;
    }

    try {
      const result = await getViewerMetrics(videoId);
      if (!this.isCurrentStream(generation) || this.broadcastStatus.currentVideoId !== videoId) {
        return this.broadcastStatus;
      }

      const nextRefreshAt = nextViewerMetricsRefreshAt();
      this.broadcastStatus = {
        ...this.broadcastStatus,
        viewerMetrics: {
          concurrentViewers: result.concurrentViewers,
          checkedAt: result.checkedAt,
          nextRefreshAt,
          intervalSeconds: viewerMetricsIntervalSeconds,
          status: result.status,
          message: result.message
        }
      };
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
      if (manual) {
        this.scheduleViewerMetricsRefresh(generation);
      }
      return this.broadcastStatus;
    } catch (error) {
      if (!this.isCurrentStream(generation) || this.broadcastStatus.currentVideoId !== videoId) {
        return this.broadcastStatus;
      }

      const nextRefreshAt = nextViewerMetricsRefreshAt();
      this.broadcastStatus = {
        ...this.broadcastStatus,
        viewerMetrics: {
          ...(this.broadcastStatus.viewerMetrics ?? idleViewerMetrics()),
          checkedAt: new Date().toISOString(),
          nextRefreshAt,
          intervalSeconds: viewerMetricsIntervalSeconds,
          status: "error",
          message: error instanceof Error ? error.message : "同時視聴者数を取得できませんでした。"
        }
      };
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
      if (manual) {
        this.scheduleViewerMetricsRefresh(generation);
      }
      return this.broadcastStatus;
    }
  }

  private isViewerMetricsRefreshCoolingDown() {
    const checkedAt = this.broadcastStatus.viewerMetrics?.checkedAt;
    if (!checkedAt) {
      return false;
    }

    const checkedAtMs = Date.parse(checkedAt);
    return Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs < viewerMetricsIntervalMs;
  }

  async showMessage(messageId: string) {
    await this.init();
    const message = this.findMessage(messageId);
    this.overlayState = {
      ...this.overlayState,
      currentMessage: { ...message, displayedAt: new Date().toISOString() }
    };
    this.markDisplayed(messageId);
    this.events.emit("overlay:show", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async hideOverlay() {
    await this.init();
    this.overlayState = {
      ...this.overlayState,
      currentMessage: null
    };
    this.events.emit("overlay:hide", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async sendTestMessage(input: TestMessageInput = {}) {
    await this.init();
    const isSuperChat = input.kind === "superChat";
    const now = Date.now();
    const message: ChatMessage = {
      id: `test-${isSuperChat ? "super-chat" : "normal"}-${now}`,
      platformMessageId: `test-${isSuperChat ? "super-chat" : "normal"}-${now}`,
      authorName: isSuperChat ? "スパチャテスト視聴者" : "テスト視聴者",
      authorImageUrl: "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png",
      messageText: isSuperChat
        ? "Super Chatプレビュー用のテストメッセージです。金額表示と強調スタイルを確認できます。"
        : "OBSオーバーレイ表示確認用のテストコメントです。",
      messageType: "testMessage",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat,
      amountText: isSuperChat ? input.amountText?.trim() || "¥1,000" : undefined,
      publishedAt: new Date().toISOString()
    };
    this.ingestMessages([message]);
    this.overlayState = {
      ...this.overlayState,
      currentMessage: { ...message, displayedAt: new Date().toISOString() }
    };
    this.events.emit("overlay:test", this.overlayState);
    await this.emitSync();
    return { message, overlay: this.overlayState };
  }

  async updateSettings(input: PatchSettingsInput) {
    await this.init();
    this.settings = await patchSettings({
      ...input,
      theme: input.theme ? normalizeTheme({ ...this.settings.theme, ...input.theme }) : undefined
    });
    this.overlayState = {
      ...this.overlayState,
      theme: this.settings.theme
    };
    this.events.emit("overlay:theme:update", this.settings);
    await this.emitSync();
    return this.settings;
  }

  async setOverlayConnected(connected: boolean) {
    await this.init();
    this.overlayConnected = connected;
    this.events.emit("overlay:connected", {
      connected,
      connectedAt: connected ? new Date().toISOString() : undefined
    });
    await this.emitSync();
  }

  private canPublishStartFailure(videoId: string) {
    return !this.broadcastStatus.isFetchingComments || this.broadcastStatus.currentVideoId === videoId;
  }

  private async publishStartFailure(broadcastUrl: string, videoId: string, error: ClassifiedYouTubeError) {
    this.resetActiveStream();
    this.broadcastStatus = {
      isFetchingComments: false,
      connectionMode: "stream",
      connectionState: terminalConnectionState(error),
      reconnectAttempt: 0,
      maxReconnectAttempts,
      nextReconnectAt: undefined,
      currentBroadcastUrl: broadcastUrl,
      currentVideoId: videoId,
      viewerMetrics: idleViewerMetrics(),
      ...broadcastErrorFields(error, "liveChatInfo")
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
  }

  private async consumeLiveChatStream(generation: number) {
    const liveChatId = this.broadcastStatus.liveChatId;
    if (!this.isCurrentStream(generation) || !this.broadcastStatus.isFetchingComments || !liveChatId) {
      return;
    }

    const abortController = new AbortController();
    this.streamAbortController = abortController;
    const streamStartedAt = Date.now();
    try {
      for await (const batch of streamLiveChatMessages({
        liveChatId,
        pageToken: this.nextPageToken,
        signal: abortController.signal
      })) {
        if (!this.isCurrentStream(generation) || abortController.signal.aborted) {
          return;
        }

        this.nextPageToken = batch.nextPageToken ?? this.nextPageToken;
        this.markStableStreamIfReady(streamStartedAt);
        this.ingestMessages(batch.messages);

        const now = new Date().toISOString();
        const ended = Boolean(batch.offlineAt);
        this.broadcastStatus = {
          ...this.broadcastStatus,
          isFetchingComments: !ended,
          connectionMode: "stream",
          connectionState: ended ? "ended" : "connected",
          reconnectAttempt: 0,
          maxReconnectAttempts,
          nextReconnectAt: undefined,
          lastFetchedAt: now,
          lastReceivedAt: now,
          actualEndTime: batch.offlineAt ?? this.broadcastStatus.actualEndTime,
          ...clearBroadcastErrorFields()
        };
        this.events.emit("broadcast:status", this.broadcastStatus);

        if (ended) {
          this.clearCurrentAbortController(abortController);
          this.clearViewerMetricsTimer();
          this.broadcastStatus = {
            ...this.broadcastStatus,
            viewerMetrics: this.broadcastStatus.viewerMetrics
              ? { ...this.broadcastStatus.viewerMetrics, nextRefreshAt: undefined }
              : idleViewerMetrics()
          };
          this.events.emit("broadcast:status", this.broadcastStatus);
          await this.emitSync();
          return;
        }
      }

      if (this.isCurrentStream(generation) && !abortController.signal.aborted) {
        this.clearCurrentAbortController(abortController);
        if (this.registerShortStreamClose(streamStartedAt)) {
          await this.stopForStreamError({
            kind: "network",
            message: "YouTubeライブチャットのストリーム接続が短時間で繰り返し終了しました。",
            retryable: false,
            reason: "short_stream_close_limit",
            phase: "stream",
            action: "配信がライブ中か、YouTube Studioでチャットが有効かを確認してから再開してください。"
          });
          return;
        }
        await this.scheduleStreamReconnect(generation);
      }
    } catch (error) {
      this.clearCurrentAbortController(abortController);
      if (!this.isCurrentStream(generation) || abortController.signal.aborted) {
        return;
      }

      const classified = classifyYouTubeError(error);
      this.markStableStreamIfReady(streamStartedAt);
      if (classified.retryable) {
        await this.scheduleStreamReconnect(generation, classified);
        return;
      }

      this.broadcastStatus = {
        ...this.broadcastStatus,
        isFetchingComments: false,
        connectionMode: "stream",
        connectionState: terminalConnectionState(classified),
        nextReconnectAt: undefined,
        viewerMetrics: this.broadcastStatus.viewerMetrics
          ? { ...this.broadcastStatus.viewerMetrics, nextRefreshAt: undefined }
          : idleViewerMetrics(),
        ...broadcastErrorFields(classified, "stream")
      };
      this.clearViewerMetricsTimer();
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
    }
  }

  private async scheduleStreamReconnect(generation: number, cause?: ClassifiedYouTubeError) {
    if (!this.isCurrentStream(generation) || !this.broadcastStatus.liveChatId) {
      return;
    }

    const reconnectAttempt = (this.broadcastStatus.reconnectAttempt ?? 0) + 1;
    if (reconnectAttempt > maxReconnectAttempts) {
      await this.stopForStreamError({
        kind: "network",
        message: "YouTubeライブチャットへ再接続できませんでした。",
        retryable: false,
        reason: "max_reconnect_attempts_exceeded",
        phase: "stream",
        action: "配信URL、YouTube側のライブ状態、ネットワーク接続を確認してから再開してください。"
      });
      return;
    }

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, maxReconnectDelayMs);
    const nextReconnectAt = new Date(Date.now() + delay).toISOString();
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: true,
      connectionMode: "stream",
      connectionState: "reconnecting",
      reconnectAttempt,
      maxReconnectAttempts,
      nextReconnectAt,
      ...(cause ? broadcastErrorFields(cause, "stream") : clearBroadcastErrorFields())
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.consumeLiveChatStream(generation);
    }, delay);
  }

  private ingestMessages(messages: ChatMessage[]) {
    const freshMessages: ChatMessage[] = [];

    for (const message of messages) {
      if (this.rememberFetchedMessageId(message.platformMessageId)) {
        freshMessages.push(message);
      }
    }

    if (!freshMessages.length) {
      return;
    }

    const newestFirst = [...freshMessages].reverse();
    this.messages = prioritizeRetainedMessages([...newestFirst, ...this.messages]);

    const superChats = newestFirst.filter((message) => message.isSuperChat);
    if (superChats.length) {
      const incomingIds = new Set(superChats.map((message) => message.platformMessageId));
      this.superChats = [
        ...superChats,
        ...this.superChats.filter((item) => !incomingIds.has(item.platformMessageId))
      ].slice(0, maxRetainedSuperChats);
    }

    for (const message of freshMessages) {
      this.events.emit("comment:new", message);
    }
  }

  private rememberFetchedMessageId(platformMessageId: string) {
    if (this.fetchedMessageIds.has(platformMessageId)) {
      return false;
    }

    this.fetchedMessageIds.add(platformMessageId);
    this.fetchedMessageIdQueue.push(platformMessageId);
    while (this.fetchedMessageIdQueue.length > maxFetchedMessageIds) {
      const expired = this.fetchedMessageIdQueue.shift();
      if (expired) {
        this.fetchedMessageIds.delete(expired);
      }
    }
    return true;
  }

  private findMessage(messageId: string) {
    const message =
      this.messages.find((candidate) => candidate.id === messageId) ??
      this.superChats.find((candidate) => candidate.id === messageId);
    if (!message) {
      throw new Error(`Message was not found: ${messageId}`);
    }
    return message;
  }

  private markDisplayed(messageId: string) {
    const now = new Date().toISOString();
    this.messages = this.messages.map((message) =>
      message.id === messageId ? { ...message, displayedAt: now } : message
    );
    this.superChats = this.superChats.map((message) =>
      message.id === messageId ? { ...message, displayedAt: now } : message
    );
  }

  private resetActiveStream() {
    this.streamGeneration += 1;
    this.reconnectDelayMs = initialReconnectDelayMs;
    this.clearViewerMetricsTimer();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }

    return this.streamGeneration;
  }

  private scheduleViewerMetricsRefresh(generation: number) {
    this.clearViewerMetricsTimer();
    if (!this.isCurrentStream(generation) || !this.broadcastStatus.isFetchingComments || !this.broadcastStatus.currentVideoId) {
      return;
    }

    this.viewerMetricsTimer = setTimeout(() => {
      this.viewerMetricsTimer = null;
      void this.refreshViewerMetricsOnce(generation, false).then(() => {
        if (this.isCurrentStream(generation) && this.broadcastStatus.isFetchingComments) {
          this.scheduleViewerMetricsRefresh(generation);
        }
      });
    }, viewerMetricsIntervalSeconds * 1000);
  }

  private clearViewerMetricsTimer() {
    if (this.viewerMetricsTimer) {
      clearTimeout(this.viewerMetricsTimer);
      this.viewerMetricsTimer = null;
    }
  }

  private isActiveBroadcastFor(videoId: string) {
    return (
      this.broadcastStatus.currentVideoId === videoId &&
      (this.broadcastStatus.isFetchingComments ||
        this.broadcastStatus.connectionState === "connecting" ||
        this.broadcastStatus.connectionState === "connected" ||
        this.broadcastStatus.connectionState === "reconnecting")
    );
  }

  private registerShortStreamClose(streamStartedAt: number) {
    if (this.markStableStreamIfReady(streamStartedAt)) {
      return false;
    }

    this.shortStreamCloseCount += 1;
    return this.shortStreamCloseCount >= maxShortStreamCloses;
  }

  private markStableStreamIfReady(streamStartedAt: number) {
    if (Date.now() - streamStartedAt < shortStreamCloseMs) {
      return false;
    }

    this.shortStreamCloseCount = 0;
    this.reconnectDelayMs = initialReconnectDelayMs;
    return true;
  }

  private async stopForStreamError(error: ClassifiedYouTubeError) {
    this.resetActiveStream();
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: false,
      connectionMode: "stream",
      connectionState: "error",
      nextReconnectAt: undefined,
      ...broadcastErrorFields(error, "stream")
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
  }

  private isCurrentStream(generation: number) {
    return generation === this.streamGeneration;
  }

  private clearCurrentAbortController(abortController: AbortController) {
    if (this.streamAbortController === abortController) {
      this.streamAbortController = null;
    }
  }

  private async emitSync() {
    this.events.emit("state:sync", await this.getState());
  }
}

declare global {
  // Keep one controller across Next route bundles and the custom Socket.IO server.
  var __youtubeChatOverlayController: AppController | undefined;
}

export const appController = globalThis.__youtubeChatOverlayController ?? new AppController();
globalThis.__youtubeChatOverlayController = appController;
