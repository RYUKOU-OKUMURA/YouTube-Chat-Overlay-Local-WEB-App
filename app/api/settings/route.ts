import { type NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { patchSettingsSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";

export async function GET() {
  const state = await appController.getState();
  return jsonOk({
    overlayToken: state.overlayToken,
    displayDurationSec: state.overlay.displayDurationSec,
    theme: state.overlay.theme,
    lastBroadcastUrl: state.broadcastStatus.currentBroadcastUrl
  });
}

export async function PATCH(request: NextRequest) {
  const parsed = patchSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", parsed.error.message, 422);
  }
  return jsonOk(await appController.updateSettings(parsed.data));
}
