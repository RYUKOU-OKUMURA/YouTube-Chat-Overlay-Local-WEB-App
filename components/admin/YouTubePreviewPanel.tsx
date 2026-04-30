"use client";

import { ExternalLink, MonitorPlay } from "lucide-react";
import { buildYouTubeEmbedUrl } from "@/lib/youtubeEmbed";
import type { BroadcastStatus } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

function connectionLabel(value: BroadcastStatus["connectionState"]) {
  if (value === "connected") return "ライブ接続中";
  if (value === "connecting") return "接続中";
  if (value === "reconnecting") return "再接続中";
  if (value === "ended") return "終了";
  if (value === "error") return "エラー";
  return "待機中";
}

function connectionTone(value: BroadcastStatus["connectionState"]) {
  if (value === "connected") return "green";
  if (value === "connecting" || value === "reconnecting") return "amber";
  if (value === "error") return "rose";
  if (value === "ended") return "blue";
  return "slate";
}

function youtubeWatchUrl(videoId?: string, broadcastUrl?: string) {
  if (broadcastUrl) return broadcastUrl;
  if (!videoId) return "https://www.youtube.com";
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function YouTubePreviewPanel({ broadcastStatus, compactMode = false }: { broadcastStatus: BroadcastStatus; compactMode?: boolean }) {
  const videoId = broadcastStatus.currentVideoId;
  const embedUrl = videoId ? buildYouTubeEmbedUrl(videoId) : null;
  const watchUrl = youtubeWatchUrl(videoId, broadcastStatus.currentBroadcastUrl);
  const canOpenYouTube = Boolean(videoId || broadcastStatus.currentBroadcastUrl);

  if (compactMode) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <MonitorPlay className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">プレビュー</span>
            <Badge tone={connectionTone(broadcastStatus.connectionState)}>{connectionLabel(broadcastStatus.connectionState)}</Badge>
          </div>
          <div className="truncate text-xs text-slate-500">
            {broadcastStatus.streamTitle || broadcastStatus.channelName || (videoId ? `動画ID: ${videoId}` : "配信URLを開始すると表示")}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          onClick={() => window.open(watchUrl, "_blank", "noopener,noreferrer")}
          disabled={!canOpenYouTube}
        >
          開く
        </Button>
      </div>
    );
  }

  return (
    <Panel
      title="YouTube映像プレビュー"
      subtitle="配信者が確認するためのYouTube再生画面です。OBSには出ません。"
      className="rounded-2xl bg-white"
      actions={<Badge tone={connectionTone(broadcastStatus.connectionState)}>{connectionLabel(broadcastStatus.connectionState)}</Badge>}
    >
      <div className="grid gap-3">
        {embedUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-sm">
            <iframe
              title={broadcastStatus.streamTitle ? `YouTubeプレビュー: ${broadcastStatus.streamTitle}` : "YouTubeライブ映像プレビュー"}
              src={embedUrl}
              className="aspect-video w-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
            <div className="grid justify-items-center gap-2 text-sm text-slate-500">
              <MonitorPlay className="h-8 w-8 text-slate-400" />
              <div>管理・設定で配信URLを開始するとここにプレビュー表示</div>
            </div>
          </div>
        )}
        <div className="grid gap-1 text-xs text-slate-600">
          {broadcastStatus.streamTitle ? <div className="truncate">配信タイトル: {broadcastStatus.streamTitle}</div> : null}
          {broadcastStatus.channelName ? <div className="truncate">チャンネル: {broadcastStatus.channelName}</div> : null}
          {videoId ? <div className="truncate">動画ID: {videoId}</div> : null}
        </div>
        <Button
          variant="ghost"
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => window.open(watchUrl, "_blank", "noopener,noreferrer")}
          disabled={!canOpenYouTube}
        >
          YouTubeで開く
        </Button>
      </div>
    </Panel>
  );
}
