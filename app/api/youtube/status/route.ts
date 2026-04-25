import { jsonOk } from "@/lib/http";
import { appController } from "@/server/state/appController";

export async function GET() {
  return jsonOk(await appController.refreshYouTubeStatus());
}
