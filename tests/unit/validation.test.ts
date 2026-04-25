import { describe, expect, it } from "vitest";
import { defaultTheme } from "@/types";
import { normalizeTheme, settingsSchema, themeSchema } from "@/lib/validation";

describe("validation defaults", () => {
  it("fills theme defaults from the canonical default theme", () => {
    expect(themeSchema.parse({})).toEqual(defaultTheme);
    expect(normalizeTheme()).toEqual(defaultTheme);
  });

  it("fills settings defaults for display duration and theme", () => {
    const parsed = settingsSchema.parse({
      overlayToken: "x".repeat(24)
    });

    expect(parsed.displayDurationSec).toBe(8);
    expect(parsed.theme).toEqual(defaultTheme);
  });

  it("enforces the display duration range", () => {
    expect(settingsSchema.safeParse({ overlayToken: "x".repeat(24), displayDurationSec: 2 }).success).toBe(false);
    expect(settingsSchema.safeParse({ overlayToken: "x".repeat(24), displayDurationSec: 3 }).success).toBe(true);
    expect(settingsSchema.safeParse({ overlayToken: "x".repeat(24), displayDurationSec: 60 }).success).toBe(true);
    expect(settingsSchema.safeParse({ overlayToken: "x".repeat(24), displayDurationSec: 61 }).success).toBe(false);
  });
});
