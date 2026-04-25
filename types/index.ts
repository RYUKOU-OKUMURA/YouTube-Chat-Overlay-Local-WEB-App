export type Badge = "member" | "moderator" | "owner" | "superChat";

export type Theme = {
  fontFamily: string;
  fontSize: number;
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
  isPinned: boolean;
  displayDurationSec: number;
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
  lastFetchedAt?: string;
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
  | "MESSAGE_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "POLLING_ERROR"
  | "UNKNOWN_ERROR";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };

export type Settings = {
  overlayToken: string;
  displayDurationSec: number;
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

export type PatchSettingsInput = Partial<{
  displayDurationSec: number;
  theme: Partial<Theme>;
  lastBroadcastUrl: string;
}>;

export const defaultTheme: Theme = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 28,
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
  overlayPin: "overlay:pin",
  overlayUnpin: "overlay:unpin",
  overlayThemeUpdate: "overlay:theme:update",
  overlayTest: "overlay:test"
} as const;
