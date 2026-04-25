import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/server/youtube/oauth";
import { appController } from "@/server/state/appController";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/admin?oauth=missing-code", request.url));
  }
  try {
    await exchangeCode(code);
    await appController.refreshYouTubeStatus();
    return NextResponse.redirect(new URL("/admin?oauth=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/admin?oauth=failed", request.url));
  }
}
