import { type NextRequest } from "next/server";
import { jsonError, jsonOk, getErrorMessage, parseJsonBody } from "@/lib/http";
import { startBroadcastSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";
import { classifyYouTubeError, type ClassifiedYouTubeError } from "@/server/youtube/api";
import type { ApiErrorCode } from "@/types";

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, startBroadcastSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  try {
    return jsonOk(await appController.startBroadcast(parsed.data));
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes("videoId")) {
      return jsonError("INVALID_BROADCAST_URL", message, 400);
    }

    const classified = classifyYouTubeError(error);
    if (classified.kind !== "unknown") {
      const mapped = mapClassifiedStartError(classified);
      return jsonError(mapped.code, formatClassifiedMessage(classified), mapped.status);
    }

    return jsonError("LIVE_CHAT_NOT_FOUND", message, 400);
  }
}

function formatClassifiedMessage(error: ClassifiedYouTubeError) {
  return error.action ? `${error.message} ${error.action}` : error.message;
}

function mapClassifiedStartError(error: ClassifiedYouTubeError): { code: ApiErrorCode; status: number } {
  if (error.kind === "unauthorized") {
    return { code: "YOUTUBE_UNAUTHORIZED", status: 401 };
  }
  if (error.kind === "permissionDenied") {
    return { code: "YOUTUBE_PERMISSION_DENIED", status: 403 };
  }
  if (error.kind === "quotaExceeded" || error.kind === "rateLimitExceeded") {
    return { code: "YOUTUBE_API_ERROR", status: 429 };
  }
  if (error.kind === "videoNotFound" || error.kind === "liveChatNotFound") {
    return { code: "LIVE_CHAT_NOT_FOUND", status: 404 };
  }
  if (error.kind === "notLiveBroadcast") {
    return { code: "LIVE_CHAT_NOT_FOUND", status: 400 };
  }
  if (error.kind === "liveNotStarted") {
    return { code: "LIVE_NOT_STARTED", status: 409 };
  }
  if (error.kind === "liveEnded" || error.kind === "liveChatEnded") {
    return { code: "LIVE_ENDED", status: 410 };
  }
  if (error.kind === "liveChatDisabled") {
    return { code: "LIVE_CHAT_DISABLED", status: 409 };
  }
  if (error.kind === "parser" || error.kind === "responseShape") {
    return { code: "YOUTUBE_RESPONSE_ERROR", status: 502 };
  }
  if (error.kind === "network") {
    return { code: "YOUTUBE_API_ERROR", status: error.retryable ? 503 : 400 };
  }
  return { code: "YOUTUBE_API_ERROR", status: 400 };
}
