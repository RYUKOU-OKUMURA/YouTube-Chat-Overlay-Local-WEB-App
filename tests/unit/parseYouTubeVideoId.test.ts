import { describe, expect, it } from "vitest";
import { parseYouTubeVideoId } from "@/server/youtube/parseYouTubeUrl";

describe("parseYouTubeVideoId", () => {
  it("accepts a bare 11 character id", () => {
    expect(parseYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("trims whitespace and parses watch urls", () => {
    expect(parseYouTubeVideoId("  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be, shorts, live, and embed urls", () => {
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-youTube or malformed input", () => {
    expect(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeVideoId("not a url")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});
