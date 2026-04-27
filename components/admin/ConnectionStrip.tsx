import { Radio, Wifi, WifiOff, MessageSquareText, Clock3 } from "lucide-react";
import type { BroadcastStatus, YouTubeStatus } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";

function oauthLabel(value: YouTubeStatus["oauth"]) {
  return value === "authorized" ? "認可済み" : "未認可";
}

function apiLabel(value: YouTubeStatus["api"]) {
  if (value === "connected") return "接続中";
  if (value === "error") return "エラー";
  return "未接続";
}

function streamErrorLabel(value: BroadcastStatus["errorKind"]) {
  if (value === "liveNotStarted") return "ライブ未開始";
  if (value === "liveEnded" || value === "liveChatEnded") return "配信終了";
  if (value === "liveChatDisabled" || value === "liveChatNotFound") return "チャット無効";
  if (value === "videoNotFound") return "動画不明";
  if (value === "notLiveBroadcast") return "ライブURL確認";
  if (value === "permissionDenied" || value === "unauthorized") return "権限エラー";
  if (value === "parser" || value === "responseShape") return "応答形式エラー";
  if (value === "quotaExceeded" || value === "rateLimitExceeded") return "API利用量エラー";
  if (value === "network") return "通信エラー";
  return null;
}

function streamLabel(status: BroadcastStatus) {
  const errorLabel = streamErrorLabel(status.errorKind);
  if (errorLabel && status.connectionState !== "reconnecting") return errorLabel;
  if (status.connectionState === "connecting") return "stream接続中";
  if (status.connectionState === "connected") return "stream接続済み";
  if (status.connectionState === "reconnecting") return "stream再接続中";
  if (status.connectionState === "ended") return "stream終了";
  if (status.connectionState === "error") return "streamエラー";
  return "stream停止中";
}

function streamTone(status: BroadcastStatus) {
  if (status.errorKind === "liveNotStarted" || status.errorKind === "liveEnded" || status.errorKind === "liveChatEnded") {
    return "amber";
  }
  if (status.errorKind) return "rose";
  if (status.connectionState === "connected") return "blue";
  if (status.connectionState === "connecting" || status.connectionState === "reconnecting") return "amber";
  if (status.connectionState === "error") return "rose";
  if (status.connectionState === "ended") return "green";
  return "slate";
}

export function ConnectionStrip({
  socketConnected,
  overlayConnected,
  youtubeStatus,
  broadcastStatus,
  lastSyncLabel,
  onRefresh
}: {
  socketConnected: boolean;
  overlayConnected: boolean;
  youtubeStatus: YouTubeStatus;
  broadcastStatus: BroadcastStatus;
  lastSyncLabel?: string;
  onRefresh: () => void;
}) {
  const needsReconnect = Boolean(youtubeStatus.needsReconnect);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <Badge tone={socketConnected ? "green" : "amber"}>{socketConnected ? "Socket接続中" : "Socket再接続中"}</Badge>
      <Badge tone={overlayConnected ? "green" : "slate"}>{overlayConnected ? "OBS接続中" : "OBS未接続"}</Badge>
      <Badge tone={needsReconnect ? "amber" : youtubeStatus.oauth === "authorized" ? "green" : "amber"}>
        {needsReconnect ? "再接続推奨" : `${oauthLabel(youtubeStatus.oauth)} / ${apiLabel(youtubeStatus.api)}`}
      </Badge>
      <Badge tone={streamTone(broadcastStatus)}>{streamLabel(broadcastStatus)}</Badge>
      {lastSyncLabel ? (
        <span className="inline-flex items-center gap-1 text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />
          {lastSyncLabel}
        </span>
      ) : null}
      <div className="ml-auto">
        <Button size="sm" variant="ghost" icon={<Radio className="h-3.5 w-3.5" />} onClick={onRefresh}>
          再同期
        </Button>
      </div>
      <span className="inline-flex items-center gap-1 text-slate-500">
        <Wifi className="h-3.5 w-3.5" />
        {socketConnected ? "接続済み" : "オフライン"}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-500">
        <WifiOff className="h-3.5 w-3.5" />
        OBS {overlayConnected ? "待受中" : "未起動"}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-500">
        <MessageSquareText className="h-3.5 w-3.5" />
        {broadcastStatus.liveChatId ? "チャット準備完了" : "チャット待機中"}
      </span>
    </div>
  );
}
