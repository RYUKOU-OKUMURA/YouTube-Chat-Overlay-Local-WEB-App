const youtubeSystemDeletedMessagePatterns = [
  /^message deleted$/i,
  /^\[message deleted\]$/i,
  /^this message was deleted\.?$/i,
  /^このメッセージは削除されました。?$/,
  /^このコメントは削除されました。?$/,
  /^メッセージが削除されました。?$/,
  /^コメントが削除されました。?$/
];

const youtubeSystemRetractedMessagePatterns = [
  /^message retracted$/i,
  /^\[message retracted\]$/i,
  /^this message was retracted\.?$/i,
  /^メッセージが撤回されました。?$/,
  /^このメッセージは撤回されました。?$/,
  /^このコメントは撤回されました。?$/,
  /^コメントが撤回されました。?$/
];

export function isYoutubeSystemDeletedMessage(messageText: string) {
  const normalized = messageText.trim();
  if (!normalized) {
    // Empty text is not a deletion placeholder; treating it as one would
    // mark unrelated recent messages from the same author as deleted.
    return false;
  }
  return youtubeSystemDeletedMessagePatterns.some((pattern) => pattern.test(normalized));
}

export function isYoutubeSystemRetractedMessage(messageText: string) {
  const normalized = messageText.trim();
  if (!normalized) {
    return false;
  }
  return youtubeSystemRetractedMessagePatterns.some((pattern) => pattern.test(normalized));
}
