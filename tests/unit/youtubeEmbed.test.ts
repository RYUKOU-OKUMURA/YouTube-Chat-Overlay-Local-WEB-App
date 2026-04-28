import { describe, expect, it } from "vitest";
import { buildYouTubeEmbedUrl } from "@/lib/youtubeEmbed";

describe("buildYouTubeEmbedUrl", () => {
  it("builds an embed URL from a known videoId", () => {
    expect(buildYouTubeEmbedUrl("abc123")).toBe("https://www.youtube.com/embed/abc123");
  });
});
