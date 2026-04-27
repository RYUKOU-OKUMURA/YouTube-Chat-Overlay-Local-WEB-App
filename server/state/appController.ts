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
const initialReconnectDelayMs = 1000;
const maxReconnectDelayMs = 60000;

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
  private reconnectDelayMs = initialReconnectDelayMs;
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

    const info = await getLiveChatInfo(videoId);
    const generation = this.resetActiveStream();
    this.nextPageToken = undefined;
    this.reconnectDelayMs = initialReconnectDelayMs;
    this.fetchedMessageIds.clear();
    this.messages = [];
    this.settings = await patchSettings({ lastBroadcastUrl: input.broadcastUrl });
    this.broadcastStatus = {
      isFetchingComments: true,
      connectionMode: "stream",
      connectionState: "connecting",
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
        this.reconnectDelayMs = initialReconnectDelayMs;
        this.ingestMessages(batch.messages);

        const now = new Date().toISOString();
        const ended = Boolean(batch.offlineAt);
        this.broadcastStatus = {
          ...this.broadcastStatus,
          isFetchingComments: !ended,
          connectionMode: "stream",
          connectionState: ended ? "ended" : "connected",
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

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, maxReconnectDelayMs);
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: true,
      connectionMode: "stream",
      connectionState: "reconnecting",
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
      this.messages = [message, ...this.messages].slice(0, maxMessages);
      this.events.emit("comment:new", message);
    }
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
