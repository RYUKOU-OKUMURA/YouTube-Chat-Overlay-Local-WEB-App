import { jsonError, jsonOk, getErrorMessage } from "@/lib/http";
import { appController } from "@/server/state/appController";

export async function POST() {
  try {
    return jsonOk(await appController.showNextMessage());
  } catch (error) {
    return jsonError("MESSAGE_NOT_FOUND", getErrorMessage(error), 409);
  }
}
