export type Badge = "member" | "moderator" | "owner" | "superChat";

export type Theme = {
  stylePreset: "midnight-glass" | "warm-pop" | "minimal-broadcast" | "festival-neon" | "clinic-calm" | "comic-pop";
  fontFamily: string;
  fontSize: number;
  autoFitText: boolean;
  cardWidth: number;
  cardPosition: "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";
  borderRadius: number;
  showAvatar: boolean;
  showAuthorName: boolean;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  animationType: "fade" | "slide-up" | "scale";
};

export type ChatMessage = {
  id: string;
  platformMessageId: string;
  authorName: string;
  authorImageUrl?: string;
  authorChannelId?: string;
  messageText: string;
  messageType: string;
  isMember: boolean;
  isModerator: boolean;
  isOwner: boolean;
  isSuperChat: boolean;
  amountText?: string;
  publishedAt: string;
  displayedAt?: string;
};

export type OverlayState = {
  currentMessage: ChatMessage | null;
  theme: Theme;
};

export type YouTubeStatus = {
  oauth: "authorized" | "unauthorized";
  api: "connected" | "disconnected" | "error";
  reason?: string;
};

export type BroadcastStatus = {
  isFetchingComments: boolean;
  currentBroadcastUrl?: string;
  currentVideoId?: string;
  liveChatId?: string;
  streamTitle?: string;
  channelName?: string;
  connectionMode?: "stream";
  connectionState?: "connecting" | "connected" | "reconnecting" | "stopped" | "ended" | "error";
  lastFetchedAt?: string;
  lastReceivedAt?: string;
  error?: string;
};

export type AppState = {
  overlayToken: string;
  messages: ChatMessage[];
  overlay: OverlayState;
  youtubeStatus: YouTubeStatus;
  broadcastStatus: BroadcastStatus;
  overlayConnected: boolean;
};

export type ApiErrorCode =
  | "ENV_MISSING"
  | "OAUTH_FAILED"
  | "YOUTUBE_UNAUTHORIZED"
  | "INVALID_BROADCAST_URL"
  | "LIVE_CHAT_NOT_FOUND"
  | "YOUTUBE_API_ERROR"
  | "MESSAGE_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "POLLING_ERROR"
  | "UNKNOWN_ERROR";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };

export type Settings = {
  overlayToken: string;
  theme: Theme;
  lastBroadcastUrl?: string;
};

export type YouTubeToken = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
};

export type StartBroadcastInput = {
  broadcastUrl: string;
};

export type TestMessageInput = {
  kind?: "normal" | "superChat";
  amountText?: string;
};

export type PatchSettingsInput = Partial<{
  theme: Partial<Theme>;
  lastBroadcastUrl: string;
}>;

export const defaultTheme: Theme = {
  stylePreset: "midnight-glass",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 28,
  autoFitText: false,
  cardWidth: 760,
  cardPosition: "bottom-center",
  borderRadius: 22,
  showAvatar: true,
  showAuthorName: true,
  backgroundColor: "rgba(17, 24, 39, 0.92)",
  textColor: "#f8fafc",
  accentColor: "#38bdf8",
  animationType: "slide-up"
};

export const socketEvents = {
  adminSubscribe: "admin:subscribe",
  overlaySubscribe: "overlay:subscribe",
  requestSync: "state:request-sync",
  stateSync: "state:sync",
  commentNew: "comment:new",
  youtubeStatus: "youtube:status",
  broadcastStatus: "broadcast:status",
  overlayConnected: "overlay:connected",
  overlayState: "overlay:state",
  overlayShow: "overlay:show",
  overlayHide: "overlay:hide",
  overlayThemeUpdate: "overlay:theme:update",
  overlayTest: "overlay:test"
} as const;
