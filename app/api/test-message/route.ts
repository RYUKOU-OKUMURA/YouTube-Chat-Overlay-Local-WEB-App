import { jsonError, jsonOk } from "@/lib/http";
import { appController } from "@/server/state/appController";
import type { TestMessageInput } from "@/types";

async function readInput(request: Request): Promise<TestMessageInput> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }

  const payload = JSON.parse(text) as TestMessageInput;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid test message payload.");
  }
  if (payload.kind !== undefined && payload.kind !== "normal" && payload.kind !== "superChat") {
    throw new Error("Unsupported test message kind.");
  }
  return {
    kind: payload.kind,
    amountText: typeof payload.amountText === "string" ? payload.amountText : undefined
  };
}

export async function POST(request: Request) {
  try {
    return jsonOk(await appController.sendTestMessage(await readInput(request)));
  } catch (error) {
    return jsonError("VALIDATION_ERROR", error instanceof Error ? error.message : "Invalid test message payload.", 422);
  }
}
