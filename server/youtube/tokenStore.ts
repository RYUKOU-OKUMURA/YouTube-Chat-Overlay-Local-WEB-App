import { mkdir, readFile, rm, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { YouTubeToken } from "@/types";

const tokenPath = path.join(process.cwd(), "data", "youtube-token.json");

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export async function readYouTubeToken(): Promise<YouTubeToken | null> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<YouTubeToken>;
    if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiryDate: parsed.expiryDate
    };
  } catch {
    return null;
  }
}

export async function writeYouTubeToken(token: YouTubeToken) {
  await writeJsonAtomic(tokenPath, token);
  return token;
}

export async function clearYouTubeToken() {
  await rm(tokenPath, { force: true });
}
