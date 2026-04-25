import { jsonOk } from "@/lib/http";
import { appController } from "@/server/state/appController";

export async function POST() {
  return jsonOk(await appController.stopBroadcast());
}
