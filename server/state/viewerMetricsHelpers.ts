import type { ViewerMetrics } from "@/types";

export const viewerMetricsIntervalSeconds = 180;
export const viewerMetricsIntervalMs = viewerMetricsIntervalSeconds * 1000;

export function idleViewerMetrics(): ViewerMetrics {
  return {
    intervalSeconds: viewerMetricsIntervalSeconds,
    status: "idle"
  };
}

export function nextViewerMetricsRefreshAt(from = Date.now()) {
  return new Date(from + viewerMetricsIntervalMs).toISOString();
}

export function viewerMetricsFromValue({
  concurrentViewers,
  checkedAt,
  nextRefreshAt
}: {
  concurrentViewers?: number;
  checkedAt: string;
  nextRefreshAt?: string;
}): ViewerMetrics {
  if (typeof concurrentViewers === "number") {
    return {
      concurrentViewers,
      checkedAt,
      nextRefreshAt,
      intervalSeconds: viewerMetricsIntervalSeconds,
      status: "available"
    };
  }

  return {
    checkedAt,
    nextRefreshAt,
    intervalSeconds: viewerMetricsIntervalSeconds,
    status: "unavailable",
    message: "視聴者数非表示または取得不可"
  };
}
