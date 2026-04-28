import type { ChatMessage } from "@/types";

export const maxRetainedMessages = 300;
export const maxRetainedSuperChats = 100;
export const maxFetchedMessageIds = 1000;

export function isImportantMessage(message: ChatMessage) {
  return message.isSuperChat || message.isMember || message.isModerator || message.isOwner;
}

function retentionPriority(message: ChatMessage) {
  const displayed = Boolean(message.displayedAt);

  if (!displayed && message.isSuperChat) return 0;
  if (!displayed && (message.isOwner || message.isModerator || message.isMember)) return 1;
  if (!displayed) return 2;
  return isImportantMessage(message) ? 3 : 4;
}

export function prioritizeRetainedMessages(messages: ChatMessage[], maxMessages = maxRetainedMessages) {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const retainedIndexes = new Set(
    messages
      .map((message, index) => ({ index, priority: retentionPriority(message) }))
      .sort((left, right) => left.priority - right.priority || left.index - right.index)
      .slice(0, maxMessages)
      .map(({ index }) => index)
  );

  return messages.filter((_, index) => retainedIndexes.has(index));
}
