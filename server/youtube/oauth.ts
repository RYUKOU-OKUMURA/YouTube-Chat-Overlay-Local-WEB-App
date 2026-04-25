import { google } from "googleapis";
import { clearYouTubeToken, readYouTubeToken, writeYouTubeToken } from "@/server/youtube/tokenStore";
import type { YouTubeStatus } from "@/types";

const scope = ["https://www.googleapis.com/auth/youtube.readonly"];

function getOAuthEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/youtube/callback";
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function createOAuthClient() {
  const env = getOAuthEnv();
  return new google.auth.OAuth2(env.clientId, env.clientSecret, env.redirectUri);
}

export function getAuthUrl() {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope
  });
}

export async function exchangeCode(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new Error("Google OAuth did not return an access token.");
  }
  await writeYouTubeToken({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? undefined,
    expiryDate: tokens.expiry_date ?? undefined
  });
}

export async function getAuthorizedClient() {
  const token = await readYouTubeToken();
  if (!token) {
    throw new Error("YouTube is not authorized.");
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate
  });

  client.on("tokens", async (tokens) => {
    const current = await readYouTubeToken();
    await writeYouTubeToken({
      accessToken: tokens.access_token ?? current?.accessToken ?? token.accessToken,
      refreshToken: tokens.refresh_token ?? current?.refreshToken ?? token.refreshToken,
      expiryDate: tokens.expiry_date ?? current?.expiryDate ?? token.expiryDate
    });
  });

  return client;
}

export async function getYouTubeStatus(): Promise<YouTubeStatus> {
  try {
    getOAuthEnv();
    const token = await readYouTubeToken();
    return {
      oauth: token ? "authorized" : "unauthorized",
      api: token ? "connected" : "disconnected"
    };
  } catch (error) {
    return {
      oauth: "unauthorized",
      api: "error",
      reason: error instanceof Error ? error.message : "OAuth configuration failed."
    };
  }
}

export async function disconnectYouTube() {
  await clearYouTubeToken();
}
