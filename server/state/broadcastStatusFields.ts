import type { ClassifiedYouTubeError } from "@/server/youtube/api";
import type { BroadcastStatus } from "@/types";

export const initialReconnectDelayMs = 2000;
export const maxReconnectDelayMs = 60000;
export const maxReconnectAttempts = 8;
export const maxShortStreamCloses = 5;
export const shortStreamCloseMs = 5000;

export function clearBroadcastErrorFields(): Partial<BroadcastStatus> {
  return {
    error: undefined,
    errorKind: undefined,
    errorReason: undefined,
    errorPhase: undefined,
    errorAction: undefined
  };
}

export function broadcastErrorFields(
  error: ClassifiedYouTubeError,
  fallbackPhase: NonNullable<BroadcastStatus["errorPhase"]>
): Partial<BroadcastStatus> {
  const fields: Partial<BroadcastStatus> = {
    error: error.message,
    errorKind: error.kind,
    errorReason: error.reason,
    errorPhase: error.phase ?? fallbackPhase,
    errorAction: error.action
  };
  if (error.scheduledStartTime) {
    fields.scheduledStartTime = error.scheduledStartTime;
  }
  if (error.actualStartTime) {
    fields.actualStartTime = error.actualStartTime;
  }
  if (error.actualEndTime) {
    fields.actualEndTime = error.actualEndTime;
  }
  return fields;
}

export function terminalConnectionState(error: ClassifiedYouTubeError): BroadcastStatus["connectionState"] {
  return error.kind === "liveChatEnded" || error.kind === "liveEnded" ? "ended" : "error";
}

export function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
