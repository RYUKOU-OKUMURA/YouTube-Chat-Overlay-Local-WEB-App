import { describe, expect, test } from "vitest";
import {
  JsonObjectStreamParser,
  YouTubeStreamParserError,
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

  test("ignores empty chunks", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push("")).toEqual([]);
    expect(parser.push("\n\n")).toEqual([]);
    expect(parser.flush()).toEqual([]);
  });

  test("throws on invalid JSON at flush", () => {
    const parser = new JsonObjectStreamParser();

    expect(parser.push('{"items":[')).toEqual([]);
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
