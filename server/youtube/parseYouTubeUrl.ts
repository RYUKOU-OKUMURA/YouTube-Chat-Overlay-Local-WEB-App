const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be"
]);

export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!youtubeHosts.has(url.hostname)) {
      return null;
    }

    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return isVideoId(id) ? id : null;
    }

    const queryId = url.searchParams.get("v");
    if (isVideoId(queryId)) {
      return queryId;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => ["live", "shorts", "embed"].includes(part));
    if (markerIndex >= 0) {
      const id = parts[markerIndex + 1];
      return isVideoId(id) ? id : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{11}$/.test(value);
}
