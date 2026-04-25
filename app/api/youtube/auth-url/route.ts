import { jsonError, jsonOk, getErrorMessage } from "@/lib/http";
import { getAuthUrl } from "@/server/youtube/oauth";

export async function GET() {
  try {
    return jsonOk({ url: getAuthUrl() });
  } catch (error) {
    return jsonError("ENV_MISSING", getErrorMessage(error), 500);
  }
}
