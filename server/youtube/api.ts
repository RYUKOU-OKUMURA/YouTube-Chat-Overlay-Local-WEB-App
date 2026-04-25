import { google, youtube_v3 } from "googleapis";
import { getAuthorizedClient } from "@/server/youtube/oauth";
import type { ChatMessage } from "@/types";

export type LiveChatInfo = {
  videoId: string;
  liveChatId: string;
  streamTitle?: string;
  channelName?: string;
};

export async function getLiveChatInfo(videoId: string): Promise<LiveChatInfo> {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.videos.list({
    part: ["snippet", "liveStreamingDetails"],
    id: [videoId]
  });
  const item = response.data.items?.[0];
  const liveChatId = item?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId) {
    throw new Error("activeLiveChatId was not found. The stream may be offline or chat may be disabled.");
  }
  return {
    videoId,
    liveChatId,
    streamTitle: item.snippet?.title ?? undefined,
    channelName: item.snippet?.channelTitle ?? undefined
  };
}

export async function fetchLiveChatMessages(liveChatId: string, pageToken?: string) {
  const auth = await getAuthorizedClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.liveChatMessages.list({
    liveChatId,
    part: ["id", "snippet", "authorDetails"],
    pageToken,
    maxResults: 200
  });

  const messages = (response.data.items ?? []).map(mapLiveChatMessage);
  return {
    messages,
    nextPageToken: response.data.nextPageToken ?? undefined,
    pollingIntervalMillis: response.data.pollingIntervalMillis ?? 5000
  };
}

function mapLiveChatMessage(item: youtube_v3.Schema$LiveChatMessage): ChatMessage {
  const snippet = item.snippet;
  const author = item.authorDetails;
  const superChat = snippet?.superChatDetails;
  const id = item.id ?? crypto.randomUUID();
  return {
    id,
    platformMessageId: id,
    authorName: author?.displayName ?? "Unknown",
    authorImageUrl: author?.profileImageUrl ?? undefined,
    authorChannelId: author?.channelId ?? undefined,
    messageText: snippet?.displayMessage ?? "",
    messageType: snippet?.type ?? "textMessageEvent",
    isMember: Boolean(author?.isChatSponsor),
    isModerator: Boolean(author?.isChatModerator),
    isOwner: Boolean(author?.isChatOwner),
    isSuperChat: Boolean(superChat),
    amountText: superChat?.amountDisplayString ?? undefined,
    publishedAt: snippet?.publishedAt ?? new Date().toISOString()
  };
}
