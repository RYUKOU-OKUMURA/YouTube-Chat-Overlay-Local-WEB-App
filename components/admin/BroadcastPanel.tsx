import { Play, Square, Copy, Link2 } from "lucide-react";
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
          {broadcastStatus.error ? <div className="text-rose-600">エラー: {broadcastStatus.error}</div> : null}
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
