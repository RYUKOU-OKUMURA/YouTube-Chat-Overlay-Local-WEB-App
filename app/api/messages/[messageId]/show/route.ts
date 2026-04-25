import { type NextRequest } from "next/server";
import { jsonError, jsonOk, getErrorMessage } from "@/lib/http";
import { appController } from "@/server/state/appController";

export async function POST(_request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await context.params;
    return jsonOk(await appController.showMessage(messageId));
  } catch (error) {
    return jsonError("MESSAGE_NOT_FOUND", getErrorMessage(error), 404);
  }
}
