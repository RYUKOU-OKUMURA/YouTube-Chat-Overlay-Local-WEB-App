import { describe, expect, test } from "vitest";
import { buildOverlayUrl } from "@/lib/overlayUrl";

describe("buildOverlayUrl", () => {
  test("returns fixed /overlay path for the given origin", () => {
    expect(buildOverlayUrl("http://localhost:3000")).toBe("http://localhost:3000/overlay");
  });
});
