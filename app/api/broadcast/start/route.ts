import { type NextRequest } from "next/server";
import { jsonError, jsonOk, getErrorMessage } from "@/lib/http";
import { startBroadcastSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";
import { classifyYouTubeError } from "@/server/youtube/api";

export async function POST(request: NextRequest) {
  const parsed = startBroadcastSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", parsed.error.message, 422);
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
      const status =
        classified.kind === "quotaExceeded" || classified.kind === "rateLimitExceeded"
          ? 429
          : classified.kind === "unauthorized"
            ? 401
            : 400;
      return jsonError("YOUTUBE_API_ERROR", classified.message, status);
    }

    return jsonError("LIVE_CHAT_NOT_FOUND", message, 400);
  }
}
