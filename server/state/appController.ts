import { EventEmitter } from "node:events";
import { classifyYouTubeError, getLiveChatInfo, streamLiveChatMessages } from "@/server/youtube/api";
import { parseYouTubeVideoId } from "@/server/youtube/parseYouTubeUrl";
import { getYouTubeStatus } from "@/server/youtube/oauth";
import { patchSettings, readSettings } from "@/server/settings/settingsStore";
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
  YouTubeStatus
} from "@/types";

type AppEvents = {
  "state:sync": [AppState];
  "comment:new": [ChatMessage];
  "youtube:status": [YouTubeStatus];
  "broadcast:status": [BroadcastStatus];
  "overlay:state": [OverlayState];
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

const maxMessages = 300;
const initialReconnectDelayMs = 2000;
const maxReconnectDelayMs = 60000;
const maxReconnectAttempts = 8;
const maxShortStreamCloses = 5;
const shortStreamCloseMs = 5000;

export class AppController {
  readonly events = new TypedEmitter();

  private initialized = false;
  private settings!: Settings;
  private messages: ChatMessage[] = [];
  private fetchedMessageIds = new Set<string>();
  private nextPageToken: string | undefined;
  private streamAbortController: AbortController | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
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
      connectionState: "stopped"
    };
    this.youtubeStatus = await getYouTubeStatus();
    this.initialized = true;
  }

  async getState(): Promise<AppState> {
    await this.init();
    return {
      overlayToken: this.settings.overlayToken,
      messages: this.messages,
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
    const info = await getLiveChatInfo(videoId);
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
    this.messages = [];
    this.settings = nextSettings;
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
      error: undefined
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
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
      error: undefined
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
    return this.broadcastStatus;
  }

  async getMessages() {
    await this.init();
    return this.messages;
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
    this.events.emit("overlay:state", this.overlayState);
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
    this.events.emit("overlay:state", this.overlayState);
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
    this.events.emit("overlay:state", this.overlayState);
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
    this.events.emit("overlay:state", this.overlayState);
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

  private async consumeLiveChatStream(generation: number) {
    const liveChatId = this.broadcastStatus.liveChatId;
    if (!this.isCurrentStream(generation) || !this.broadcastStatus.isFetchingComments || !liveChatId) {
      return;
    }

    const abortController = new AbortController();
    this.streamAbortController = abortController;
    const streamStartedAt = Date.now();
    let receivedBatch = false;

    try {
      for await (const batch of streamLiveChatMessages({
        liveChatId,
        pageToken: this.nextPageToken,
        signal: abortController.signal
      })) {
        if (!this.isCurrentStream(generation) || abortController.signal.aborted) {
          return;
        }

        receivedBatch = true;
        this.nextPageToken = batch.nextPageToken ?? this.nextPageToken;
        this.reconnectDelayMs = initialReconnectDelayMs;
        this.shortStreamCloseCount = 0;
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
          error: undefined
        };
        this.events.emit("broadcast:status", this.broadcastStatus);
        await this.emitSync();

        if (ended) {
          this.clearCurrentAbortController(abortController);
          return;
        }
      }

      if (this.isCurrentStream(generation) && !abortController.signal.aborted) {
        this.clearCurrentAbortController(abortController);
        if (this.registerShortStreamClose(receivedBatch, streamStartedAt)) {
          await this.stopForStreamError("Live chat stream closed too quickly too many times.");
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
      if (classified.retryable) {
        await this.scheduleStreamReconnect(generation);
        return;
      }

      this.broadcastStatus = {
        ...this.broadcastStatus,
        isFetchingComments: false,
        connectionMode: "stream",
        connectionState: classified.kind === "liveChatEnded" ? "ended" : "error",
        error: classified.message
      };
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
    }
  }

  private async scheduleStreamReconnect(generation: number) {
    if (!this.isCurrentStream(generation) || !this.broadcastStatus.liveChatId) {
      return;
    }

    const reconnectAttempt = (this.broadcastStatus.reconnectAttempt ?? 0) + 1;
    if (reconnectAttempt > maxReconnectAttempts) {
      await this.stopForStreamError("Live chat stream could not reconnect.");
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
      error: undefined
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.consumeLiveChatStream(generation);
    }, delay);
  }

  private ingestMessages(messages: ChatMessage[]) {
    for (const message of messages) {
      if (this.fetchedMessageIds.has(message.platformMessageId)) {
        continue;
      }
      this.fetchedMessageIds.add(message.platformMessageId);
      this.messages = this.prioritizeRetainedMessages([message, ...this.messages]);
      this.events.emit("comment:new", message);
    }
  }

  private prioritizeRetainedMessages(messages: ChatMessage[]) {
    if (messages.length <= maxMessages) {
      return messages;
    }

    const retainedIndexes = new Set(
      messages
        .map((message, index) => ({ index, priority: this.retentionPriority(message) }))
        .sort((left, right) => left.priority - right.priority || left.index - right.index)
        .slice(0, maxMessages)
        .map(({ index }) => index)
    );

    return messages.filter((_, index) => retainedIndexes.has(index));
  }

  private retentionPriority(message: ChatMessage) {
    const displayed = Boolean(message.displayedAt);
    const important = message.isSuperChat || message.isOwner || message.isModerator || message.isMember;

    if (!displayed && message.isSuperChat) {
      return 0;
    }

    if (!displayed && (message.isOwner || message.isModerator || message.isMember)) {
      return 1;
    }

    if (!displayed) {
      return 2;
    }

    return important ? 3 : 4;
  }

  private findMessage(messageId: string) {
    const message = this.messages.find((candidate) => candidate.id === messageId);
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
  }

  private resetActiveStream() {
    this.streamGeneration += 1;
    this.reconnectDelayMs = initialReconnectDelayMs;

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

  private isActiveBroadcastFor(videoId: string) {
    return (
      this.broadcastStatus.currentVideoId === videoId &&
      (this.broadcastStatus.isFetchingComments ||
        this.broadcastStatus.connectionState === "connecting" ||
        this.broadcastStatus.connectionState === "connected" ||
        this.broadcastStatus.connectionState === "reconnecting")
    );
  }

  private registerShortStreamClose(receivedBatch: boolean, streamStartedAt: number) {
    if (receivedBatch || Date.now() - streamStartedAt >= shortStreamCloseMs) {
      this.shortStreamCloseCount = 0;
      return false;
    }

    this.shortStreamCloseCount += 1;
    return this.shortStreamCloseCount >= maxShortStreamCloses;
  }

  private async stopForStreamError(error: string) {
    this.resetActiveStream();
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: false,
      connectionMode: "stream",
      connectionState: "error",
      nextReconnectAt: undefined,
      error
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
