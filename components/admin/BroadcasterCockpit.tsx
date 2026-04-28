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
  busyAction
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
}) {
  return (
    <aside className="grid content-start gap-4">
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
  );
}
