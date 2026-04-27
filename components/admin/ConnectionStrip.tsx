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

function streamLabel(value: BroadcastStatus["connectionState"]) {
  if (value === "connecting") return "stream接続中";
  if (value === "connected") return "stream接続済み";
  if (value === "reconnecting") return "stream再接続中";
  if (value === "ended") return "stream終了";
  if (value === "error") return "streamエラー";
  return "stream停止中";
}

function streamTone(value: BroadcastStatus["connectionState"]) {
  if (value === "connected") return "blue";
  if (value === "connecting" || value === "reconnecting") return "amber";
  if (value === "error") return "rose";
  if (value === "ended") return "green";
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
      <Badge tone={streamTone(broadcastStatus.connectionState)}>{streamLabel(broadcastStatus.connectionState)}</Badge>
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
