import { z } from "zod";
import { defaultTheme, type ApiErrorCode, type ApiResponse, type Theme } from "@/types";

const colorSchema = z.string().min(1).max(80);

export const themeSchema = z.object({
  fontFamily: z.string().min(1).max(120).default(defaultTheme.fontFamily),
  fontSize: z.number().int().min(16).max(64).default(defaultTheme.fontSize),
  cardWidth: z.number().int().min(360).max(1200).default(defaultTheme.cardWidth),
  cardPosition: z.enum([
    "bottom-left",
    "bottom-center",
    "bottom-right",
    "top-left",
    "top-center",
    "top-right"
  ]).default(defaultTheme.cardPosition),
  borderRadius: z.number().int().min(0).max(48).default(defaultTheme.borderRadius),
  showAvatar: z.boolean().default(defaultTheme.showAvatar),
  showAuthorName: z.boolean().default(defaultTheme.showAuthorName),
  backgroundColor: colorSchema.default(defaultTheme.backgroundColor),
  textColor: colorSchema.default(defaultTheme.textColor),
  accentColor: colorSchema.default(defaultTheme.accentColor),
  animationType: z.enum(["fade", "slide-up", "scale"]).default(defaultTheme.animationType)
});

export const settingsSchema = z.object({
  overlayToken: z.string().min(24),
  displayDurationSec: z.number().int().min(3).max(60).default(8),
  theme: themeSchema.default(defaultTheme),
  lastBroadcastUrl: z.string().optional()
});

export const startBroadcastSchema = z.object({
  broadcastUrl: z.string().min(8)
});

export const patchSettingsSchema = z.object({
  displayDurationSec: z.number().int().min(3).max(60).optional(),
  theme: themeSchema.partial().optional(),
  lastBroadcastUrl: z.string().optional()
});

export function normalizeTheme(theme?: Partial<Theme>): Theme {
  return themeSchema.parse({ ...defaultTheme, ...theme });
}

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(code: ApiErrorCode, message: string): ApiResponse<never> {
  return { ok: false, error: { code, message } };
}
