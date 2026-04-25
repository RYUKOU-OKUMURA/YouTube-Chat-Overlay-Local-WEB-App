import { type NextRequest } from "next/server";
import { jsonError, jsonOk, getErrorMessage } from "@/lib/http";
import { startBroadcastSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";

export async function POST(request: NextRequest) {
  const parsed = startBroadcastSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", parsed.error.message, 422);
  }
  try {
    return jsonOk(await appController.startBroadcast(parsed.data));
  } catch (error) {
    const message = getErrorMessage(error);
    const code = message.includes("videoId") ? "INVALID_BROADCAST_URL" : "LIVE_CHAT_NOT_FOUND";
    return jsonError(code, message, 400);
  }
}
