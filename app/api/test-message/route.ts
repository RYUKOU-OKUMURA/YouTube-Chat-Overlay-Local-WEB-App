import { jsonOk, parseJsonBody } from "@/lib/http";
import { testMessageSchema } from "@/lib/validation";
import { appController } from "@/server/state/appController";

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, testMessageSchema, { emptyBody: {} });
  if (!parsed.success) {
    return parsed.response;
  }

  return jsonOk(await appController.sendTestMessage(parsed.data));
}
