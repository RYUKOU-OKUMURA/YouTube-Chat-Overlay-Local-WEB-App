"use client";

import type { BroadcastStatus, OverlayState } from "@/types";
import type { ChatMessage } from "@/types";
import { BroadcastMetricsPanel } from "@/components/admin/BroadcastMetricsPanel";
import { OverlayPanel } from "@/components/admin/OverlayPanel";
import { SuperChatPanel } from "@/components/admin/SuperChatPanel";
import { YouTubePreviewPanel } from "@/components/admin/YouTubePreviewPanel";

export function BroadcasterCockpit({
  broadcastStatus,
  superChats,
  overlay,
  onHide,
  onRefreshViewerMetrics,
  onShowMessage,
  onCopyMessage,
  onCopyOverlayUrl,
  busyAction,
  compactMode = false
}: {
  broadcastStatus: BroadcastStatus;
  superChats: ChatMessage[];
  overlay: OverlayState;
  onHide: () => void;
  onRefreshViewerMetrics: () => void;
  onShowMessage: (message: ChatMessage) => void;
  onCopyMessage: (message?: ChatMessage) => void;
  onCopyOverlayUrl: () => void;
  busyAction: string | null;
  compactMode?: boolean;
}) {
  const compactContent = (
    <aside className="grid content-start gap-3">
      <YouTubePreviewPanel broadcastStatus={broadcastStatus} compactMode />
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-900">配信メトリクス</summary>
        <div className="border-t border-slate-100 p-3">
          <BroadcastMetricsPanel
            broadcastStatus={broadcastStatus}
            onRefresh={onRefreshViewerMetrics}
            busy={busyAction === "viewer-metrics"}
          />
        </div>
      </details>
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-900">Super Chat / Sticker {superChats.length}件</summary>
        <div className="border-t border-slate-100 p-3">
          <SuperChatPanel
            superChats={superChats}
            activeMessageId={overlay.currentMessage?.id ?? null}
            onShowMessage={onShowMessage}
            onCopyMessage={(message) => onCopyMessage(message)}
            busyAction={busyAction}
          />
        </div>
      </details>
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-900">
          現在のOBS表示: {overlay.currentMessage ? "表示中" : "非表示"}
        </summary>
        <div className="border-t border-slate-100 p-3">
          <OverlayPanel
            overlay={overlay}
            onHide={onHide}
            onCopyMessage={() => onCopyMessage()}
            onCopyOverlayUrl={onCopyOverlayUrl}
          />
        </div>
      </details>
    </aside>
  );

  if (compactMode) {
    return compactContent;
  }

  return (
    <>
      <div className="sm:hidden">{compactContent}</div>
      <aside className="hidden content-start gap-4 sm:grid">
        <YouTubePreviewPanel broadcastStatus={broadcastStatus} />
        <BroadcastMetricsPanel
          broadcastStatus={broadcastStatus}
          onRefresh={onRefreshViewerMetrics}
          busy={busyAction === "viewer-metrics"}
        />
        <SuperChatPanel
          superChats={superChats}
          activeMessageId={overlay.currentMessage?.id ?? null}
          onShowMessage={onShowMessage}
          onCopyMessage={(message) => onCopyMessage(message)}
          busyAction={busyAction}
        />
        <OverlayPanel
          overlay={overlay}
          onHide={onHide}
          onCopyMessage={() => onCopyMessage()}
          onCopyOverlayUrl={onCopyOverlayUrl}
        />
      </aside>
    </>
  );
}
