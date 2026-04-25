import { jsonOk } from "@/lib/http";
import { disconnectYouTube } from "@/server/youtube/oauth";
import { appController } from "@/server/state/appController";

export async function POST() {
  await disconnectYouTube();
  return jsonOk(await appController.refreshYouTubeStatus());
}
