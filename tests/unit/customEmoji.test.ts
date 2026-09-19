import { describe, expect, test } from "vitest";
import { extractYouTubeChatContent, selectEmojiImage } from "@/server/youtube/customEmoji";

describe("YouTube custom emoji enrichment", () => {
  test("selects the smallest sharp thumbnail rather than the largest asset", () => {
    expect(
      selectEmojiImage([
        { url: "https://yt3.ggpht.com/emoji-24", width: 24, height: 24 },
        { url: "https://yt3.ggpht.com/emoji-48", width: 48, height: 48 },
        { url: "https://yt3.ggpht.com/emoji-96", width: 96, height: 96 }
      ])
    ).toBe("https://yt3.ggpht.com/emoji-48");
  });

  test("rejects non-HTTPS emoji image URLs", () => {
    expect(selectEmojiImage([{ url: "http://example.test/emoji", width: 48, height: 48 }])).toBeUndefined();
  });

  test("preserves text and renders a custom emoji as an image segment", () => {
    expect(
      extractYouTubeChatContent({
        runs: [
          { text: "最高 " },
          {
            text: ":channel_wave:",
            emoji: {
              shortcuts: [":channel_wave:"],
              image: [{ url: "https://yt3.ggpht.com/channel-wave", width: 48, height: 48 }]
            }
          },
          { text: " ありがとう" }
        ]
      })
    ).toEqual([
      { kind: "text", text: "最高 " },
      {
        kind: "emoji",
        shortcode: ":channel_wave:",
        alt: ":channel_wave:",
        imageUrl: "https://yt3.ggpht.com/channel-wave"
      },
      { kind: "text", text: " ありがとう" }
    ]);
  });

  test("leaves official API text untouched when there is no usable emoji image", () => {
    expect(extractYouTubeChatContent({ runs: [{ text: ":channel_wave:" }] })).toBeUndefined();
  });
});
