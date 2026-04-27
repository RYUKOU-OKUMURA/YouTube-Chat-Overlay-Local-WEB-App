import { ArrowRight, LogOut, ShieldCheck, ShieldAlert } from "lucide-react";
import type { YouTubeStatus } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

export function OAuthPanel({
  youtubeStatus,
  onConnect,
  onDisconnect,
  busy
}: {
  youtubeStatus: YouTubeStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  busy?: boolean;
}) {
  const connected = youtubeStatus.oauth === "authorized";
  const needsReconnect = Boolean(youtubeStatus.needsReconnect);
  const apiLabel = youtubeStatus.api === "connected" ? "接続中" : youtubeStatus.api === "error" ? "エラー" : "未接続";
  return (
    <Panel
      title="YouTube OAuth"
      subtitle="配信コメントを取得する前に、このローカルアプリをYouTubeへ接続します。"
      actions={<Badge tone={needsReconnect ? "amber" : connected ? "green" : "amber"}>{needsReconnect ? "再接続推奨" : connected ? "認可済み" : "未認可"}</Badge>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          {connected && !needsReconnect ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
          <span className="min-w-0">
            API状態: <strong>{apiLabel}</strong>
            {youtubeStatus.reason ? <span className="text-slate-500"> · {youtubeStatus.reason}</span> : null}
          </span>
        </div>
        {needsReconnect ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            再接続推奨: YouTube認可情報の更新が必要です。再接続を行ってください。
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button icon={<ArrowRight className="h-4 w-4" />} onClick={onConnect} disabled={busy}>
            {connected ? "再接続" : "接続"}
          </Button>
          <Button variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={onDisconnect} disabled={busy || !connected}>
            接続解除
          </Button>
        </div>
      </div>
    </Panel>
  );
}
