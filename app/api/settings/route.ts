import { type NextRequest } from "next/server";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { patchSettingsSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";

export async function GET() {
  const state = await appController.getState();
  return jsonOk({
    overlayToken: state.overlayToken,
    theme: state.overlay.theme,
    lastBroadcastUrl: state.broadcastStatus.currentBroadcastUrl
  });
}

export async function PATCH(request: NextRequest) {
  const parsed = await parseJsonBody(request, patchSettingsSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  return jsonOk(await appController.updateSettings(parsed.data));
}
