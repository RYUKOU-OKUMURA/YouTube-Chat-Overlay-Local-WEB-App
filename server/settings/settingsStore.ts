import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultTheme, type Settings } from "@/types";
import { normalizeTheme, settingsSchema } from "@/lib/validation";

const dataDir = path.join(process.cwd(), "data");
const settingsPath = path.join(dataDir, "settings.json");

export function createOverlayToken() {
  return randomBytes(24).toString("base64url");
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export function createDefaultSettings(): Settings {
  return {
    overlayToken: createOverlayToken(),
    displayDurationSec: 8,
    theme: defaultTheme
  };
}

export async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath, "utf8");
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return {
        ...parsed.data,
        theme: normalizeTheme(parsed.data.theme)
      };
    }
  } catch {
    // Missing or corrupt settings are replaced with safe local defaults.
  }

  const defaults = createDefaultSettings();
  await writeSettings(defaults);
  return defaults;
}

export async function writeSettings(settings: Settings): Promise<Settings> {
  const normalized = settingsSchema.parse({
    ...settings,
    theme: normalizeTheme(settings.theme)
  });
  await writeJsonAtomic(settingsPath, normalized);
  return normalized;
}

export async function patchSettings(patch: Partial<Settings> & { theme?: Partial<Settings["theme"]> }) {
  const current = await readSettings();
  const next = settingsSchema.parse({
    ...current,
    ...patch,
    theme: normalizeTheme({ ...current.theme, ...patch.theme })
  });
  await writeSettings(next);
  return next;
}
