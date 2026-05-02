import { describe, expect, test } from "vitest";
import { getSuperChatTier, parseYenAmount } from "@/lib/superChat";
import { mapLiveChatMessage, mapLiveChatMessageDeletion, mapLiveChatStreamItems } from "@/server/youtube/api";

describe("Super Chat helpers", () => {
  test.each([
    ["¥500", 500, "blue"],
    ["¥1,000", 1000, "gold"],
    ["￥５，０００", 5000, "purple"],
    ["JPY 10,000", 10000, "red"]
  ])("parses %s into yen tiers", (amountText, amount, tierId) => {
    expect(parseYenAmount(amountText)).toBe(amount);
    expect(getSuperChatTier(amountText).id).toBe(tierId);
  });

  test("falls back to the gold tier for non-yen or unparseable amounts", () => {
    expect(parseYenAmount("US$10")).toBeNull();
    expect(parseYenAmount("Super Chat")).toBeNull();
    expect(getSuperChatTier("US$10").id).toBe("gold");
    expect(getSuperChatTier("Super Chat").id).toBe("gold");
  });
});

describe("YouTube live chat mapping", () => {
  test("maps Super Chat details into ChatMessage fields", () => {
    const message = mapLiveChatMessage({
      id: "live-chat-1",
      snippet: {
        displayMessage: "応援しています",
        type: "superChatEvent",
        publishedAt: "2026-04-27T12:00:00.000Z",
        superChatDetails: {
          amountDisplayString: "¥1,000"
        }
      },
      authorDetails: {
        displayName: "スパチャ視聴者",
        profileImageUrl: "https://example.com/avatar.png",
        channelId: "channel-1",
        isChatSponsor: true,
        isChatModerator: false,
        isChatOwner: false
      }
    });

    expect(message).toMatchObject({
      id: "live-chat-1",
      platformMessageId: "live-chat-1",
      authorName: "スパチャ視聴者",
      messageText: "応援しています",
      messageType: "superChatEvent",
      isMember: true,
      isModerator: false,
      isOwner: false,
      isSuperChat: true,
      amountText: "¥1,000",
      publishedAt: "2026-04-27T12:00:00.000Z"
    });
  });

  test("maps Super Sticker details into paid ChatMessage fields", () => {
    const message = mapLiveChatMessage({
      id: "live-chat-sticker-1",
      snippet: {
        displayMessage: "",
        type: "superStickerEvent",
        publishedAt: "2026-04-27T12:03:00.000Z",
        superStickerDetails: {
          amountDisplayString: "¥300",
          superStickerMetadata: {
            altText: "Hands doing the sign of the horns with sparkles around"
          }
        }
      },
      authorDetails: {
        displayName: "ステッカー視聴者"
      }
    });

    expect(message).toMatchObject({
      id: "live-chat-sticker-1",
      platformMessageId: "live-chat-sticker-1",
      authorName: "ステッカー視聴者",
      messageText: "Hands doing the sign of the horns with sparkles around",
      messageType: "superStickerEvent",
      isSuperChat: true,
      amountText: "¥300",
      publishedAt: "2026-04-27T12:03:00.000Z"
    });
  });

  test("handles missing author and display message fields", () => {
    const message = mapLiveChatMessage({
      id: "live-chat-2",
      snippet: {
        type: "textMessageEvent"
      }
    });

    expect(message).toMatchObject({
      id: "live-chat-2",
      platformMessageId: "live-chat-2",
      authorName: "Unknown",
      messageText: "",
      messageType: "textMessageEvent",
      isMember: false,
      isModerator: false,
      isOwner: false,
      isSuperChat: false
    });
    expect(message.publishedAt).toEqual(expect.any(String));
  });

  test("maps moderator deletion events without adding them as chat messages", () => {
    const deletedEvent = {
      id: "delete-event-1",
      snippet: {
        type: "messageDeletedEvent",
        publishedAt: "2026-04-27T12:05:00.000Z",
        messageDeletedDetails: {
          deletedMessageId: "live-chat-1"
        }
      }
    };

    expect(mapLiveChatMessageDeletion(deletedEvent)).toEqual({
      targetPlatformMessageId: "live-chat-1",
      deletionStatus: "deleted",
      deletedAt: "2026-04-27T12:05:00.000Z"
    });

    expect(
      mapLiveChatStreamItems([
        {
          id: "live-chat-2",
          snippet: {
            displayMessage: "hello",
            type: "textMessageEvent",
            publishedAt: "2026-04-27T12:04:00.000Z"
          },
          authorDetails: {
            displayName: "Viewer"
          }
        },
        deletedEvent
      ])
    ).toMatchObject({
      messages: [{ id: "live-chat-2", messageText: "hello" }],
      deletions: [{ targetPlatformMessageId: "live-chat-1", deletionStatus: "deleted" }]
    });
  });

  test("maps author retraction events", () => {
    expect(
      mapLiveChatMessageDeletion({
        id: "retract-event-1",
        snippet: {
          type: "messageRetractedEvent",
          publishedAt: "2026-04-27T12:06:00.000Z",
          messageRetractedDetails: {
            retractedMessageId: "live-chat-2"
          }
        }
      })
    ).toEqual({
      targetPlatformMessageId: "live-chat-2",
      deletionStatus: "retracted",
      deletedAt: "2026-04-27T12:06:00.000Z"
    });
  });

  test("ignores malformed deletion events without adding empty chat messages", () => {
    expect(
      mapLiveChatStreamItems([
        {
          id: "delete-event-without-target",
          snippet: {
            type: "messageDeletedEvent",
            publishedAt: "2026-04-27T12:07:00.000Z"
          }
        }
      ])
    ).toEqual({ messages: [], deletions: [] });
  });
});
