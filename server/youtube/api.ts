import { google } from "googleapis";
import type { youtube_v3 } from "googleapis";
import { getAuthorizedClient } from "@/server/youtube/oauth";
import { readPollingIntervalMillis, type LiveChatMessageDeletion } from "@/server/youtube/deletions";
import { YouTubeDiagnosticError } from "@/server/youtube/errors";
import { normalizeStreamResponse, parseLiveChatStreamResponses } from "@/server/youtube/streamParser";
import { collectDeletionEventsFromListItems, mapLiveChatStreamItems } from "@/server/youtube/messageMapping";
import { resolveLiveChatAuthorNames } from "@/server/youtube/authorNames";
import type { ChatMessage } from "@/types";

export {
  YouTubeDiagnosticError,
  YouTubeStreamParserError,
  YouTubeStreamResponseShapeError,
  YouTubeStreamTruncatedError,
  type ClassifiedYouTubeError,
  type YouTubeApiErrorKind,
  type YouTubeErrorPhase
} from "@/server/youtube/errors";
export { classifyYouTubeError } from "@/server/youtube/errorClassification";
export { JsonObjectStreamParser, parseLiveChatStreamResponses } from "@/server/youtube/streamParser";
export {
  collectDeletionEventsFromListItems,
  mapLiveChatMessage,
  mapLiveChatStreamItems
} from "@/server/youtube/messageMapping";
export { clearLiveChatAuthorNameCache, resolveLiveChatAuthorNames } from "@/server/youtube/authorNames";
export {
  mapLiveChatMessageDeletion,
  mapRemovalPlaceholderDeletion,
  type LiveChatMessageDeletion
} from "@/server/youtube/deletions";
export { isYoutubeSystemRetractedMessage } from "@/lib/youtubeSystemMessages";

export type LiveChatInfo = {
  videoId: string;
  liveChatId: string;
  streamTitle?: string;
  channelName?: string;
  concurrentViewers?: number;
  scheduledStartTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
};

export type ViewerMetricsResult = {
  concurrentViewers?: number;
  checkedAt: string;
  status: "available" | "unavailable";
  message?: string;
};

export type LiveChatStreamBatch = {
  messages: ChatMessage[];
  deletions: LiveChatMessageDeletion[];
  nextPageToken?: string;
  offlineAt?: string;
  pollingIntervalMillis?: number;
};

export type StreamLiveChatMessagesInput = {
  liveChatId: string;
  pageToken?: string;
  signal?: AbortSignal;
  profileImageSize?: number;
};

function parseConcurrentViewers(value: youtube_v3.Schema$VideoLiveStreamingDetails["concurrentViewers"]) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getActiveLiveBroadcastInfo(): Promise<LiveChatInfo> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.liveBroadcasts.list({
    part: ["id", "snippet", "status"],
    broadcastStatus: "active",
    broadcastType: "all",
    mine: true,
    maxResults: 5
  });
  const items = response.data.items ?? [];
  if (!items.length) {
    throw new YouTubeDiagnosticError({
      kind: "liveChatNotFound",
      message: "現在配信中のYouTubeライブが見つかりません。",
      reason: "active_broadcast_not_found",
      phase: "liveChatInfo",
      action: "YouTubeで配信を開始してから、もう一度コメント取得を開始してください。",
      status: 404
    });
  }

  const item = items.find((candidate) => candidate.id && candidate.snippet?.liveChatId) ?? items.find((candidate) => candidate.id);
  if (!item?.id) {
    throw new YouTubeDiagnosticError({
      kind: "responseShape",
      message: "現在配信中のYouTubeライブを検出しましたが、動画IDを取得できませんでした。",
      reason: "active_broadcast_id_missing",
      phase: "liveChatInfo",
      action: "YouTube APIの応答形式を確認してください。",
      status: 502
    });
  }

  const scheduledStartTime = item.snippet?.scheduledStartTime ?? undefined;
  const actualStartTime = item.snippet?.actualStartTime ?? undefined;
  const actualEndTime = item.snippet?.actualEndTime ?? undefined;
  if (actualEndTime) {
    throw new YouTubeDiagnosticError({
      kind: "liveEnded",
      message: "検出したYouTubeライブはすでに終了しています。",
      reason: "active_broadcast_ended",
      phase: "liveChatInfo",
      action: "現在配信中のライブがあるか確認してください。",
      status: 410,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }

  const liveChatId = item.snippet?.liveChatId ?? undefined;
  if (!liveChatId) {
    throw new YouTubeDiagnosticError({
      kind: "liveChatDisabled",
      message: "現在配信中のライブは見つかりましたが、ライブチャットIDを取得できませんでした。",
      reason: "active_broadcast_live_chat_id_missing",
      phase: "liveChatInfo",
      action: "YouTube Studioでライブチャットが有効になっているか確認してください。",
      status: 409,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }

  return {
    videoId: item.id,
    liveChatId,
    streamTitle: item.snippet?.title ?? undefined,
    scheduledStartTime,
    actualStartTime,
    actualEndTime
  };
}

export async function getLiveChatInfo(videoId: string): Promise<LiveChatInfo> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.videos.list({
    part: ["snippet", "liveStreamingDetails"],
    id: [videoId]
  });
  const item = response.data.items?.[0];
  if (!item) {
    throw new YouTubeDiagnosticError({
      kind: "videoNotFound",
      message: "YouTube動画が見つからないか、このアカウントからアクセスできません。",
      reason: "video_not_found_or_inaccessible",
      phase: "liveChatInfo",
      action: "URLが正しいか、限定公開・非公開動画へのアクセス権があるか確認してください。",
      status: 404
    });
  }

  const liveChatId = item.liveStreamingDetails?.activeLiveChatId;
  const scheduledStartTime = item.liveStreamingDetails?.scheduledStartTime ?? undefined;
  const actualStartTime = item.liveStreamingDetails?.actualStartTime ?? undefined;
  const actualEndTime = item.liveStreamingDetails?.actualEndTime ?? undefined;
  const liveBroadcastContent = item.snippet?.liveBroadcastContent;

  if (actualEndTime) {
    throw new YouTubeDiagnosticError({
      kind: "liveEnded",
      message: "このYouTubeライブはすでに終了しています。",
      reason: "live_broadcast_ended",
      phase: "liveChatInfo",
      action: "現在配信中のライブURLを入力してください。",
      status: 410,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }

  if (liveBroadcastContent === "upcoming" || (scheduledStartTime && !actualStartTime)) {
    throw new YouTubeDiagnosticError({
      kind: "liveNotStarted",
      message: "このYouTubeライブはまだ開始されていません。",
      reason: "live_broadcast_not_started",
      phase: "liveChatInfo",
      action: "配信開始後にもう一度コメント取得を開始してください。",
      status: 409,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }

  if (liveBroadcastContent === "none" && !item.liveStreamingDetails) {
    throw new YouTubeDiagnosticError({
      kind: "notLiveBroadcast",
      message: "このURLはライブ配信の動画ではありません。",
      reason: "not_live_broadcast",
      phase: "liveChatInfo",
      action: "YouTubeライブ配信ページのURLを入力してください。",
      status: 400,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }

  if (!liveChatId) {
    throw new YouTubeDiagnosticError({
      kind: "liveChatDisabled",
      message: "ライブ配信は取得できますが、ライブチャットが有効ではありません。",
      reason: "active_live_chat_id_missing",
      phase: "liveChatInfo",
      action: "YouTube Studioでライブチャットが有効になっているか確認してください。",
      status: 409,
      scheduledStartTime,
      actualStartTime,
      actualEndTime
    });
  }
  return {
    videoId,
    liveChatId,
    streamTitle: item.snippet?.title ?? undefined,
    channelName: item.snippet?.channelTitle ?? undefined,
    concurrentViewers: parseConcurrentViewers(item.liveStreamingDetails?.concurrentViewers),
    scheduledStartTime,
    actualStartTime,
    actualEndTime
  };
}

export async function getViewerMetrics(videoId: string): Promise<ViewerMetricsResult> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.videos.list({
    part: ["liveStreamingDetails"],
    id: [videoId]
  });
  const item = response.data.items?.[0];
  if (!item) {
    throw new YouTubeDiagnosticError({
      kind: "videoNotFound",
      message: "YouTube動画が見つからないか、このアカウントからアクセスできません。",
      reason: "video_not_found_or_inaccessible",
      phase: "request",
      action: "同時視聴者数を更新できませんでした。URLやアクセス権を確認してください。",
      status: 404
    });
  }

  const concurrentViewers = parseConcurrentViewers(item.liveStreamingDetails?.concurrentViewers);
  const checkedAt = new Date().toISOString();
  if (typeof concurrentViewers === "number") {
    return { concurrentViewers, checkedAt, status: "available" };
  }

  return {
    checkedAt,
    status: "unavailable",
    message: "視聴者数非表示または取得不可"
  };
}

export async function* streamLiveChatMessages({
  liveChatId,
  pageToken,
  signal,
  profileImageSize = 88
}: StreamLiveChatMessagesInput): AsyncGenerator<LiveChatStreamBatch> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.youtube.v3.liveChat.messages.stream(
    {
      liveChatId,
      part: ["id", "snippet", "authorDetails"],
      pageToken,
      maxResults: 200,
      profileImageSize
    },
    {
      responseType: "stream",
      signal
    }
  );

  for await (const item of parseLiveChatStreamResponses(response.data)) {
    const normalized = normalizeStreamResponse(item);
    const streamItems = normalized.items ?? [];
    const { messages, deletions } = mapLiveChatStreamItems(streamItems);
    const resolvedMessages = await resolveLiveChatAuthorNames(messages, youtube);

    yield {
      messages: resolvedMessages,
      deletions,
      nextPageToken: normalized.nextPageToken ?? undefined,
      offlineAt: normalized.offlineAt ?? undefined,
      pollingIntervalMillis: readPollingIntervalMillis(normalized)
    };
  }
}

export async function listLiveChatDeletionEvents(liveChatId: string) {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.liveChatMessages.list({
    liveChatId,
    part: ["id", "snippet", "authorDetails"],
    maxResults: 200
  });
  return collectDeletionEventsFromListItems(response.data.items ?? []);
}
