"use client";

import { RefreshCcw, Users } from "lucide-react";
import type { BroadcastStatus } from "@/types";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Panel } from "@/components/common/Panel";

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "未取得";
}

function statusLabel(status: BroadcastStatus["viewerMetrics"]): string {
  if (!status || status.status === "idle") return "待機中";
  if (status.status === "available") return "取得済み";
  if (status.status === "unavailable") return "取得不可";
  return "エラー";
}

function statusTone(status: BroadcastStatus["viewerMetrics"]) {
  if (status?.status === "available") return "green";
  if (status?.status === "unavailable") return "amber";
  if (status?.status === "error") return "rose";
  return "slate";
}

export function BroadcastMetricsPanel({
  broadcastStatus,
  onRefresh,
  busy
}: {
  broadcastStatus: BroadcastStatus;
  onRefresh: () => void;
  busy?: boolean;
}) {
  const metrics = broadcastStatus.viewerMetrics;
  const viewerLabel = typeof metrics?.concurrentViewers === "number" ? metrics.concurrentViewers.toLocaleString() : "--";

  return (
    <Panel
      title="配信メトリクス"
      subtitle="同時視聴者数は3分ごとに更新します。"
      className="rounded-2xl bg-white"
      actions={<Badge tone={statusTone(metrics)}>{statusLabel(metrics)}</Badge>}
    >
      <div className="grid gap-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Users className="h-4 w-4 text-slate-500" />
            同時視聴者数
          </div>
          <div className="text-2xl font-semibold tabular-nums text-slate-950">{viewerLabel}</div>
        </div>
        {metrics?.message ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{metrics.message}</div> : null}
        <div className="grid gap-1 text-xs text-slate-600">
          <div>最終更新: {formatTime(metrics?.checkedAt)}</div>
          <div>次回更新: {formatTime(metrics?.nextRefreshAt)}</div>
        </div>
        <Button
          variant="ghost"
          icon={<RefreshCcw className="h-4 w-4" />}
          onClick={onRefresh}
          disabled={busy || !broadcastStatus.currentVideoId || !broadcastStatus.isFetchingComments}
        >
          手動更新
        </Button>
      </div>
    </Panel>
  );
}
