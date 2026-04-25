import { EventEmitter } from "node:events";
import { getLiveChatInfo, fetchLiveChatMessages } from "@/server/youtube/api";
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
  "overlay:pin": [OverlayState];
  "overlay:unpin": [OverlayState];
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

class AppController {
  readonly events = new TypedEmitter();

  private initialized = false;
  private settings!: Settings;
  private messages: ChatMessage[] = [];
  private fetchedMessageIds = new Set<string>();
  private nextPageToken: string | undefined;
  private pollTimer: NodeJS.Timeout | null = null;
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
      isPinned: false,
      displayDurationSec: this.settings.displayDurationSec,
      theme: this.settings.theme
    };
    this.broadcastStatus = {
      isFetchingComments: false,
      currentBroadcastUrl: this.settings.lastBroadcastUrl
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
    this.stopPollTimer();
    this.nextPageToken = undefined;
    this.fetchedMessageIds.clear();
    this.messages = [];
    this.settings = await patchSettings({ lastBroadcastUrl: input.broadcastUrl });
    this.broadcastStatus = {
      isFetchingComments: true,
      currentBroadcastUrl: input.broadcastUrl,
      currentVideoId: info.videoId,
      liveChatId: info.liveChatId,
      streamTitle: info.streamTitle,
      channelName: info.channelName
    };
    this.events.emit("broadcast:status", this.broadcastStatus);
    await this.emitSync();
    void this.pollOnce();
    return this.broadcastStatus;
  }

  async stopBroadcast() {
    await this.init();
    this.stopPollTimer();
    this.broadcastStatus = {
      ...this.broadcastStatus,
      isFetchingComments: false
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
      currentMessage: { ...message, displayedAt: new Date().toISOString() },
      isPinned: false
    };
    this.markDisplayed(messageId);
    this.events.emit("overlay:show", this.overlayState);
    this.events.emit("overlay:state", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async pinMessage(messageId: string) {
    await this.init();
    const message = this.findMessage(messageId);
    this.overlayState = {
      ...this.overlayState,
      currentMessage: { ...message, displayedAt: new Date().toISOString() },
      isPinned: true
    };
    this.markDisplayed(messageId);
    this.events.emit("overlay:pin", this.overlayState);
    this.events.emit("overlay:state", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async hideOverlay() {
    await this.init();
    this.overlayState = {
      ...this.overlayState,
      currentMessage: null,
      isPinned: false
    };
    this.events.emit("overlay:hide", this.overlayState);
    this.events.emit("overlay:state", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async unpinOverlay() {
    await this.init();
    this.overlayState = {
      ...this.overlayState,
      isPinned: false
    };
    this.events.emit("overlay:unpin", this.overlayState);
    this.events.emit("overlay:state", this.overlayState);
    await this.emitSync();
    return this.overlayState;
  }

  async sendTestMessage() {
    await this.init();
    const message: ChatMessage = {
      id: `test-${Date.now()}`,
      platformMessageId: `test-${Date.now()}`,
      authorName: "テスト視聴者",
      authorImageUrl: "https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png",
      messageText: "OBSオーバーレイ表示確認用のテストコメントです。",
      messageType: "testMessage",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat: false,
      publishedAt: new Date().toISOString()
    };
    this.ingestMessages([message]);
    this.overlayState = {
      ...this.overlayState,
      currentMessage: { ...message, displayedAt: new Date().toISOString() },
      isPinned: false
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
      displayDurationSec: this.settings.displayDurationSec,
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

  private async pollOnce() {
    if (!this.broadcastStatus.isFetchingComments || !this.broadcastStatus.liveChatId) {
      return;
    }
    try {
      const result = await fetchLiveChatMessages(this.broadcastStatus.liveChatId, this.nextPageToken);
      this.nextPageToken = result.nextPageToken;
      this.ingestMessages(result.messages);
      this.broadcastStatus = {
        ...this.broadcastStatus,
        isFetchingComments: true,
        lastFetchedAt: new Date().toISOString(),
        error: undefined
      };
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
      this.pollTimer = setTimeout(() => void this.pollOnce(), result.pollingIntervalMillis);
    } catch (error) {
      this.broadcastStatus = {
        ...this.broadcastStatus,
        isFetchingComments: false,
        error: error instanceof Error ? error.message : "Comment polling failed."
      };
      this.events.emit("broadcast:status", this.broadcastStatus);
      await this.emitSync();
    }
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

  private stopPollTimer() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async emitSync() {
    this.events.emit("state:sync", await this.getState());
  }
}

declare global {
  // Keep one controller across Next route bundles and the custom Socket.IO server.
  // eslint-disable-next-line no-var
  var __youtubeChatOverlayController: AppController | undefined;
}

export const appController = globalThis.__youtubeChatOverlayController ?? new AppController();
globalThis.__youtubeChatOverlayController = appController;
