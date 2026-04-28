// Caller owns videoId parsing and validation; this helper only builds the player URL.
export function buildYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
}
