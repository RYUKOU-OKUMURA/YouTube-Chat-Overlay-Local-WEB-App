import { describe, expect, it } from "vitest";
import { defaultTheme } from "@/types";
import { normalizeTheme, settingsSchema, themeSchema } from "@/lib/validation";

describe("validation defaults", () => {
  it("fills theme defaults from the canonical default theme", () => {
    expect(themeSchema.parse({})).toEqual(defaultTheme);
    expect(normalizeTheme()).toEqual(defaultTheme);
  });

  it("fills settings defaults for theme", () => {
    const parsed = settingsSchema.parse({});

    expect(parsed.theme).toEqual(defaultTheme);
  });
});
