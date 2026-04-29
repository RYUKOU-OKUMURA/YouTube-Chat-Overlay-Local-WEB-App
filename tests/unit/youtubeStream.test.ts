import { describe, expect, test } from "vitest";
import {
  JsonObjectStreamParser,
  YouTubeStreamParserError,
  YouTubeStreamTruncatedError,
  YouTubeStreamResponseShapeError,
  parseLiveChatStreamResponses
} from "@/server/youtube/api";

async function* chunks(values: Array<Buffer | string>) {
  for (const value of values) {
    yield value;
  }
}

describe("YouTube live chat stream parser", () => {
  test("parses split JSON responses", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"nextPageToken":"token-1","items":[{"id":"message-1","snippet":{"displayMessage":"hel',
        'lo","type":"textMessageEvent"},"authorDetails":{"displayName":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe("hello");
  });

  test("preserves multibyte UTF-8 characters split across buffer chunks", async () => {
    const message = "こんばんはー。新参者ですがいつも楽しく見させていただいてます♪";
    const payload = Buffer.from(
      JSON.stringify({
        nextPageToken: "token-1",
        items: [
          {
            id: "message-1",
            snippet: { displayMessage: message, type: "textMessageEvent" },
            authorDetails: { displayName: "Viewer" }
          }
        ]
      })
    );
    const splitAt = payload.indexOf(Buffer.from("だ")) + 1;
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(chunks([payload.subarray(0, splitAt), payload.subarray(splitAt)]))) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe(message);
  });

  test("parses multiple JSON responses from one chunk", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"nextPageToken":"token-1","items":[]}\n{"offlineAt":"2026-04-27T12:00:00.000Z","items":[]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[1].offlineAt).toBe("2026-04-27T12:00:00.000Z");
  });

  test("parses objects from YouTube streaming JSON arrays before the array closes", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '[{"next_page_token":"token-1","items":[{"id":"message-1","snippet":{"display_message":"hello","type":"textMessageEvent"},"author_details":{"display_name":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[0].items?.[0].snippet?.displayMessage).toBe("hello");
    expect(responses[0].items?.[0].authorDetails?.displayName).toBe("Viewer");
  });

  test("normalizes snake-case Super Sticker stream details", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '{"items":[{"id":"sticker-1","snippet":{"type":"superStickerEvent","display_message":"","super_sticker_details":{"amount_display_string":"¥300","super_sticker_metadata":{"alt_text":"Hands doing the sign of the horns with sparkles around","alt_text_language":"en","sticker_id":"hands-horns"}}},"author_details":{"display_name":"Viewer"}}]}'
      ])
    )) {
      responses.push(response);
    }

    const sticker = responses[0].items?.[0];
    expect(sticker?.snippet?.type).toBe("superStickerEvent");
    expect(sticker?.snippet?.superStickerDetails?.amountDisplayString).toBe("¥300");
    expect(sticker?.snippet?.superStickerDetails?.superStickerMetadata?.altText).toBe(
      "Hands doing the sign of the horns with sparkles around"
    );
    expect(sticker?.snippet?.superStickerDetails?.superStickerMetadata?.stickerId).toBe("hands-horns");
  });

  test("parses multiple objects from a streaming JSON array", async () => {
    const responses = [];

    for await (const response of parseLiveChatStreamResponses(
      chunks([
        '[{"nextPageToken":"token-1","items":[]}',
        ',{"offline_at":"2026-04-27T12:00:00.000Z","items":[]}'
      ])
    )) {
      responses.push(response);
    }

    expect(responses).toHaveLength(2);
    expect(responses[0].nextPageToken).toBe("token-1");
    expect(responses[1].offlineAt).toBe("2026-04-27T12:00:00.000Z");
  });

  test("ignores empty chunks", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push("")).toEqual([]);
    expect(parser.push("\n\n")).toEqual([]);
    expect(parser.flush()).toEqual([]);
  });

  test("throws retryable truncated stream errors for incomplete JSON at flush", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push('{"items":[')).toEqual([]);
    let thrown: unknown;
    try {
      parser.flush();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(YouTubeStreamTruncatedError);
    expect(thrown).toMatchObject({
      kind: "network",
      reason: "incomplete_stream_json",
      retryable: true
    });
  });

  test("throws terminal parser errors for complete invalid JSON objects", () => {
    const parser = new JsonObjectStreamParser();

    expect(() => parser.push("{invalid}")).toThrow(YouTubeStreamParserError);
  });

  test("throws terminal parser errors for non JSON stream content", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push("not-json")).toEqual([]);
    expect(() => parser.flush()).toThrow(YouTubeStreamParserError);
  });

  test("throws terminal response shape errors for invalid list responses", async () => {
    await expect(async () => {
      for await (const response of parseLiveChatStreamResponses(chunks(['{"items":{"id":"message-1"}}']))) {
        expect(response).toBeDefined();
        // Exhaust the async iterator so parser errors surface in the assertion.
      }
    }).rejects.toThrow(YouTubeStreamResponseShapeError);
  });
});
