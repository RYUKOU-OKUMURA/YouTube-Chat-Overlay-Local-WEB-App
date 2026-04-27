import { AlertTriangle, Play, Square, Copy, Link2 } from "lucide-react";
import type { BroadcastStatus } from "@/types";
import { Button } from "@/components/common/Button";
import { Field } from "@/components/common/Field";
import { Panel } from "@/components/common/Panel";

function connectionLabel(value: BroadcastStatus["connectionState"]) {
  if (value === "connecting") return "接続中";
  if (value === "connected") return "接続済み";
  if (value === "reconnecting") return "再接続中";
  if (value === "ended") return "終了";
  if (value === "error") return "エラー";
  return "停止中";
}

function errorLabel(value: BroadcastStatus["errorKind"]) {
  if (value === "liveNotStarted") return "ライブ未開始";
  if (value === "liveEnded" || value === "liveChatEnded") return "配信終了";
  if (value === "liveChatDisabled" || value === "liveChatNotFound") return "チャット確認";
  if (value === "videoNotFound") return "動画確認";
  if (value === "notLiveBroadcast") return "ライブURL確認";
  if (value === "permissionDenied" || value === "unauthorized") return "YouTube認可確認";
  if (value === "parser" || value === "responseShape") return "応答形式エラー";
  if (value === "quotaExceeded" || value === "rateLimitExceeded") return "API利用量確認";
  if (value === "network") return "ネットワーク確認";
  return "コメント取得エラー";
}

function errorToneClass(value: BroadcastStatus["errorKind"]) {
  if (value === "liveNotStarted" || value === "liveEnded" || value === "liveChatEnded") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : null;
}

export function BroadcastPanel({
  broadcastUrl,
  setBroadcastUrl,
  broadcastStatus,
  onStart,
  onStop,
  onCopyOverlayUrl,
  busy
}: {
  broadcastUrl: string;
  setBroadcastUrl: (value: string) => void;
  broadcastStatus: BroadcastStatus;
  onStart: () => void;
  onStop: () => void;
  onCopyOverlayUrl: () => void;
  busy?: boolean;
}) {
  const errorTitle = broadcastStatus.error ? errorLabel(broadcastStatus.errorKind) : null;
  const scheduledStartTime = formatDateTime(broadcastStatus.scheduledStartTime);
  const actualStartTime = formatDateTime(broadcastStatus.actualStartTime);
  const actualEndTime = formatDateTime(broadcastStatus.actualEndTime);

  return (
    <Panel title="配信" subtitle="YouTubeライブURLを登録してコメント取得を開始します。">
      <div className="grid gap-3">
        <Field label="配信URL" hint="YouTube Studioまたは配信ページのライブ動画URLを入力します。">
          <input
            value={broadcastUrl}
            onChange={(event) => setBroadcastUrl(event.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Play className="h-4 w-4" />} onClick={onStart} disabled={busy || !broadcastUrl.trim()}>
            開始
          </Button>
          <Button variant="ghost" icon={<Square className="h-4 w-4" />} onClick={onStop} disabled={busy}>
            停止
          </Button>
          <Button variant="ghost" icon={<Link2 className="h-4 w-4" />} onClick={onCopyOverlayUrl}>
            OBS URLをコピー
          </Button>
        </div>
        <div className="grid gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1">取得中: {broadcastStatus.isFetchingComments ? "はい" : "いいえ"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">方式: {broadcastStatus.connectionMode ?? "stream"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">接続: {connectionLabel(broadcastStatus.connectionState)}</span>
            {broadcastStatus.currentVideoId ? <span className="rounded-full bg-slate-100 px-2 py-1">動画ID: {broadcastStatus.currentVideoId}</span> : null}
            {broadcastStatus.liveChatId ? <span className="rounded-full bg-slate-100 px-2 py-1">チャットID: {broadcastStatus.liveChatId}</span> : null}
          </div>
          {broadcastStatus.streamTitle ? <div>配信タイトル: {broadcastStatus.streamTitle}</div> : null}
          {broadcastStatus.channelName ? <div>チャンネル: {broadcastStatus.channelName}</div> : null}
          {broadcastStatus.error ? (
            <div className={`grid gap-1 rounded-lg border px-3 py-2 text-sm ${errorToneClass(broadcastStatus.errorKind)}`}>
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                {errorTitle}
              </div>
              <div>{broadcastStatus.error}</div>
              {broadcastStatus.errorAction ? <div className="text-xs opacity-85">{broadcastStatus.errorAction}</div> : null}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-75">
                {scheduledStartTime ? <span>予定開始: {scheduledStartTime}</span> : null}
                {actualStartTime ? <span>開始: {actualStartTime}</span> : null}
                {actualEndTime ? <span>終了: {actualEndTime}</span> : null}
              </div>
            </div>
          ) : null}
          {broadcastStatus.lastFetchedAt ? <div>最終取得: {new Date(broadcastStatus.lastFetchedAt).toLocaleString()}</div> : null}
          {broadcastStatus.lastReceivedAt ? <div>最終受信: {new Date(broadcastStatus.lastReceivedAt).toLocaleString()}</div> : null}
          {broadcastStatus.currentBroadcastUrl ? <div>現在のURL: {broadcastStatus.currentBroadcastUrl}</div> : null}
        </div>
        <Button variant="ghost" size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={onCopyOverlayUrl}>
          OBS URLをもう一度コピー
        </Button>
      </div>
    </Panel>
  );
}
