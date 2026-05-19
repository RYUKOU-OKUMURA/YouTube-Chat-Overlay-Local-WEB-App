import { describe, expect, test } from "vitest";
import {
  DeletionRegistry,
  deletionKey,
  deletionMatchesMessage,
  findAuthorRetractionTarget,
  resolveDeletionTarget
} from "@/server/youtube/deletions";
import type { ChatMessage } from "@/types";

const message = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  platformMessageId: id,
  authorName: "Viewer",
  authorChannelId: "channel-1",
  messageText: `message ${id}`,
  messageType: "textMessageEvent",
  isMember: false,
  isModerator: false,
  isOwner: false,
  isSuperChat: false,
  publishedAt: "2026-04-27T12:00:00.000Z",
  ...overrides
});

describe("deletions module", () => {
  test("deletionKey unifies merge and pending keys", () => {
    const deletion = {
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
      deletionStatus: "retracted" as const,
      deletedAt: "2026-04-27T12:01:00.000Z"
    };
    expect(deletionKey(deletion)).toBe("anchor:channel-1:2026-04-27T12:01:00.000Z");
  });

  test("findAuthorRetractionTarget picks newest when two candidates are within 2 seconds", () => {
    const messages = [
      message("older", { publishedAt: "2026-04-27T12:00:58.000Z" }),
      message("newer", { publishedAt: "2026-04-27T12:00:59.500Z" })
    ];
    expect(findAuthorRetractionTarget(messages, [], "channel-1", "2026-04-27T12:01:00.000Z")).toBe("newer");
  });

  test("resolveDeletionTarget uses registry timeline when message was evicted from retention", () => {
    const registry = new DeletionRegistry();
    registry.rememberAuthorMessage("channel-1", "evicted-msg", "2026-04-27T12:00:30.000Z");
    const deletion = {
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
      deletionStatus: "retracted" as const,
      deletedAt: "2026-04-27T12:01:00.000Z"
    };
    const resolved = resolveDeletionTarget(deletion, [], [], registry.getTimelineForAuthor("channel-1"));
    expect(resolved.targetPlatformMessageId).toBe("evicted-msg");
  });

  test("deletionMatchesMessage matches resolved platform id for author anchor", () => {
    const messages = [message("target", { publishedAt: "2026-04-27T12:00:30.000Z" })];
    const deletion = {
      targetAuthorChannelId: "channel-1",
      authorRetractionAnchor: "2026-04-27T12:01:00.000Z",
      deletionStatus: "retracted" as const,
      deletedAt: "2026-04-27T12:01:00.000Z"
    };
    const resolved = resolveDeletionTarget(deletion, messages, []);
    expect(
      deletionMatchesMessage(resolved, messages[0]!, messages, [])
    ).toBe(true);
  });
});
