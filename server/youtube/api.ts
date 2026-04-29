import type { Readable } from "node:stream";
import { google } from "googleapis";
import type { youtube_v3 } from "googleapis";
import { getAuthorizedClient } from "@/server/youtube/oauth";
import type { ChatMessage } from "@/types";

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
  nextPageToken?: string;
  offlineAt?: string;
};

export type StreamLiveChatMessagesInput = {
  liveChatId: string;
  pageToken?: string;
  signal?: AbortSignal;
  profileImageSize?: number;
};

export type YouTubeApiErrorKind =
  | "quotaExceeded"
  | "rateLimitExceeded"
  | "liveChatEnded"
  | "liveChatDisabled"
  | "liveChatNotFound"
  | "liveNotStarted"
  | "liveEnded"
  | "videoNotFound"
  | "notLiveBroadcast"
  | "permissionDenied"
  | "unauthorized"
  | "parser"
  | "responseShape"
  | "network"
  | "unknown";

export type YouTubeErrorPhase = "liveChatInfo" | "stream" | "request";

export type ClassifiedYouTubeError = {
  kind: YouTubeApiErrorKind;
  message: string;
  retryable: boolean;
  reason?: string;
  phase?: YouTubeErrorPhase;
  action?: string;
  status?: number;
  scheduledStartTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
};

type YouTubeDiagnosticErrorInput = {
  kind: YouTubeApiErrorKind;
  message: string;
  reason: string;
  phase: YouTubeErrorPhase;
  action: string;
  retryable?: boolean;
  status?: number;
  scheduledStartTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
};

export class YouTubeDiagnosticError extends Error {
  readonly kind: YouTubeApiErrorKind;
  readonly reason: string;
  readonly phase: YouTubeErrorPhase;
  readonly action: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly scheduledStartTime?: string;
  readonly actualStartTime?: string;
  readonly actualEndTime?: string;

  constructor(input: YouTubeDiagnosticErrorInput) {
    super(input.message);
    this.name = "YouTubeDiagnosticError";
    this.kind = input.kind;
    this.reason = input.reason;
    this.phase = input.phase;
    this.action = input.action;
    this.retryable = input.retryable ?? false;
    this.status = input.status;
    this.scheduledStartTime = input.scheduledStartTime;
    this.actualStartTime = input.actualStartTime;
    this.actualEndTime = input.actualEndTime;
  }
}

export class YouTubeStreamParserError extends YouTubeDiagnosticError {
  constructor(message = "YouTubeライブチャットの応答を読み取れませんでした。", reason = "invalid_stream_json") {
    super({
      kind: "parser",
      message,
      reason,
      phase: "stream",
      action: "コメント取得を停止しました。配信を再開する前に、YouTube側の一時的な応答異常が続いていないか確認してください。",
      retryable: false,
      status: 502
    });
    this.name = "YouTubeStreamParserError";
  }
}

export class YouTubeStreamTruncatedError extends YouTubeDiagnosticError {
  constructor(message = "YouTubeライブチャットのJSON応答が途中で終了しました。", reason = "incomplete_stream_json") {
    super({
      kind: "network",
      message,
      reason,
      phase: "stream",
      action: "YouTube側または通信経路でストリームが途中切断されました。自動で再接続します。",
      retryable: true,
      status: 502
    });
    this.name = "YouTubeStreamTruncatedError";
  }
}

export class YouTubeStreamResponseShapeError extends YouTubeDiagnosticError {
  constructor(message = "YouTubeライブチャットの応答形式が想定と異なります。", reason = "invalid_stream_response_shape") {
    super({
      kind: "responseShape",
      message,
      reason,
      phase: "stream",
      action: "コメント取得を停止しました。しばらくしても続く場合はYouTube APIの応答仕様変更を確認してください。",
      retryable: false,
      status: 502
    });
    this.name = "YouTubeStreamResponseShapeError";
  }
}

function parseConcurrentViewers(value: youtube_v3.Schema$VideoLiveStreamingDetails["concurrentViewers"]) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    yield {
      messages: (normalized.items ?? []).map(mapLiveChatMessage),
      nextPageToken: normalized.nextPageToken ?? undefined,
      offlineAt: normalized.offlineAt ?? undefined
    };
  }
}

export async function* parseLiveChatStreamResponses(
  stream: AsyncIterable<Buffer | string | Uint8Array> | Readable
): AsyncGenerator<youtube_v3.Schema$LiveChatMessageListResponse> {
  const parser = new JsonObjectStreamParser();
  for await (const chunk of stream) {
    for (const value of parser.push(chunk)) {
      yield normalizeStreamResponse(value);
    }
  }
  for (const value of parser.flush()) {
    yield normalizeStreamResponse(value);
  }
}

export class JsonObjectStreamParser {
  private buffer = "";
  private inTopLevelArray = false;

  push(chunk: Buffer | string | Uint8Array) {
    this.buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return this.drain(false);
  }

  flush() {
    return this.drain(true);
  }

  private drain(flush: boolean) {
    const values: unknown[] = [];

    while (true) {
      this.buffer = stripJsonStreamPrefix(this.buffer.trimStart());
      if (!this.buffer) {
        return values;
      }

      if (this.inTopLevelArray) {
        if (this.buffer.startsWith(",")) {
          this.buffer = this.buffer.slice(1);
          continue;
        }
        if (this.buffer.startsWith("]")) {
          this.buffer = this.buffer.slice(1);
          this.inTopLevelArray = false;
          continue;
        }
        if (!this.buffer.startsWith("{")) {
          if (flush) {
            throw new YouTubeStreamParserError(
              "YouTubeライブチャットのJSON配列を解析できませんでした。",
              "unexpected_stream_json_token"
            );
          }
          return values;
        }
      } else if (this.buffer.startsWith("[")) {
        this.inTopLevelArray = true;
        this.buffer = this.buffer.slice(1);
        continue;
      } else if (!this.buffer.startsWith("{")) {
        if (flush) {
          throw new YouTubeStreamParserError(
            "YouTubeライブチャットのJSON応答を解析できませんでした。",
            "unexpected_stream_json_token"
          );
        }
        return values;
      }

      const end = findCompleteJsonObjectEnd(this.buffer);
      if (end === null) {
        if (flush) {
          throw new YouTubeStreamTruncatedError(
            "YouTubeライブチャットのJSON応答が途中で終了しました。",
            "incomplete_stream_json"
          );
        }
        return values;
      }

      const raw = this.buffer.slice(0, end + 1);
      try {
        values.push(JSON.parse(raw));
      } catch {
        throw new YouTubeStreamParserError(
          "YouTubeライブチャットのJSON応答を解析できませんでした。",
          "invalid_stream_json"
        );
      }
      this.buffer = this.buffer.slice(end + 1);
    }
  }
}

export function classifyYouTubeError(error: unknown): ClassifiedYouTubeError {
  if (isYouTubeDiagnosticError(error)) {
    return {
      kind: error.kind,
      message: error.message,
      retryable: error.retryable,
      reason: error.reason,
      phase: error.phase,
      action: error.action,
      status: error.status,
      scheduledStartTime: error.scheduledStartTime,
      actualStartTime: error.actualStartTime,
      actualEndTime: error.actualEndTime
    };
  }

  if (isAbortError(error)) {
    return {
      kind: "network",
      message: "YouTubeライブチャットへの接続を停止しました。",
      retryable: false,
      reason: "aborted",
      phase: "stream",
      action: "ユーザー操作または内部処理により停止されています。"
    };
  }

  const reason = extractYouTubeErrorReason(error);
  const message = getYouTubeErrorMessage(error);

  if (reason === "quotaExceeded") {
    return {
      kind: "quotaExceeded",
      message: "YouTube APIの利用上限に達しました。",
      retryable: false,
      reason,
      phase: "request",
      action: "Google Cloud Consoleで割り当てを確認するか、上限がリセットされるまで待ってください。",
      status: getErrorStatus(error) ?? 429
    };
  }
  if (reason === "rateLimitExceeded") {
    return {
      kind: "rateLimitExceeded",
      message: "YouTubeライブチャットへのリクエストが短時間に集中しています。",
      retryable: false,
      reason,
      phase: "request",
      action: "少し時間をおいてからコメント取得を再開してください。",
      status: getErrorStatus(error) ?? 429
    };
  }
  if (reason === "liveChatEnded" || message.toLowerCase().includes("live chat ended")) {
    return {
      kind: "liveChatEnded",
      message: "YouTubeライブチャットは終了しています。",
      retryable: false,
      reason: reason ?? "liveChatEnded",
      phase: "stream",
      action: "配信が終了している場合は、コメント取得を停止したままで問題ありません。",
      status: getErrorStatus(error) ?? 410
    };
  }
  if (reason === "liveChatDisabled") {
    return {
      kind: "liveChatDisabled",
      message: "この配信ではライブチャットが無効です。",
      retryable: false,
      reason,
      phase: "request",
      action: "YouTube Studioでライブチャット設定を確認してください。",
      status: getErrorStatus(error) ?? 409
    };
  }
  if (reason === "liveChatNotFound") {
    return {
      kind: "liveChatNotFound",
      message: "YouTubeライブチャットが見つかりません。",
      retryable: false,
      reason,
      phase: "request",
      action: "配信が開始済みで、チャットが有効なライブURLか確認してください。",
      status: getErrorStatus(error) ?? 404
    };
  }
  if (isPermissionDeniedYouTubeError(error, reason, message)) {
    return {
      kind: "permissionDenied",
      message: "YouTube APIの権限が不足しています。",
      retryable: false,
      reason: reason ?? "permission_denied",
      phase: "request",
      action: "YouTube連携を解除して再接続し、必要な権限を許可してください。",
      status: getErrorStatus(error) ?? 403
    };
  }
  if (isUnauthorizedYouTubeError(error, reason)) {
    return {
      kind: "unauthorized",
      message: "YouTube連携の認証が無効、または期限切れです。",
      retryable: false,
      reason: reason ?? "unauthorized",
      phase: "request",
      action: "管理画面からYouTube連携をやり直してください。",
      status: getErrorStatus(error) ?? 401
    };
  }
  if (isNetworkLikeError(error)) {
    return {
      kind: "network",
      message: "YouTubeライブチャットへの接続が一時的に切断されました。",
      retryable: true,
      reason: extractNetworkReason(error) ?? "network_error",
      phase: "stream",
      action: "自動で再接続します。そのまましばらくお待ちください。",
      status: getErrorStatus(error)
    };
  }

  return {
    kind: "unknown",
    message,
    retryable: false,
    reason: reason ?? undefined,
    status: getErrorStatus(error)
  };
}

export function mapLiveChatMessage(item: youtube_v3.Schema$LiveChatMessage): ChatMessage {
  const snippet = item.snippet;
  const author = item.authorDetails;
  const superChat = snippet?.superChatDetails;
  const superSticker = snippet?.superStickerDetails;
  const paidDetails = superChat ?? superSticker;
  const superStickerAltText = superSticker?.superStickerMetadata?.altText ?? undefined;
  const displayMessage = snippet?.displayMessage?.trim() ? snippet.displayMessage : (superStickerAltText ?? "");
  const id = item.id ?? crypto.randomUUID();
  return {
    id,
    platformMessageId: id,
    authorName: author?.displayName ?? "Unknown",
    authorImageUrl: author?.profileImageUrl ?? undefined,
    authorChannelId: author?.channelId ?? undefined,
    messageText: displayMessage,
    messageType: snippet?.type ?? "textMessageEvent",
    isMember: Boolean(author?.isChatSponsor),
    isModerator: Boolean(author?.isChatModerator),
    isOwner: Boolean(author?.isChatOwner),
    isSuperChat: Boolean(paidDetails) || snippet?.type === "superStickerEvent",
    amountText: paidDetails?.amountDisplayString ?? undefined,
    publishedAt: snippet?.publishedAt ?? new Date().toISOString()
  };
}

function normalizeStreamResponse(value: unknown): youtube_v3.Schema$LiveChatMessageListResponse {
  if (!isRecord(value)) {
    throw new YouTubeStreamResponseShapeError(
      "YouTubeライブチャットの応答がオブジェクトではありません。",
      "stream_response_not_object"
    );
  }
  if ("items" in value && !Array.isArray(value.items)) {
    throw new YouTubeStreamResponseShapeError(
      "YouTubeライブチャットのメッセージ一覧が配列ではありません。",
      "stream_items_not_array"
    );
  }

  return {
    ...value,
    nextPageToken: readString(value.nextPageToken) ?? readString(value.next_page_token) ?? undefined,
    offlineAt: readString(value.offlineAt) ?? readString(value.offline_at) ?? undefined,
    items: Array.isArray(value.items) ? value.items.map(normalizeStreamMessage) : undefined
  } as youtube_v3.Schema$LiveChatMessageListResponse;
}

function normalizeStreamMessage(value: unknown): youtube_v3.Schema$LiveChatMessage {
  if (!isRecord(value)) {
    return {};
  }
  const snippet = isRecord(value.snippet) ? value.snippet : undefined;
  const author = isRecord(value.authorDetails)
    ? value.authorDetails
    : isRecord(value.author_details)
      ? value.author_details
      : undefined;
  const superChat = isRecord(snippet?.superChatDetails)
    ? snippet?.superChatDetails
    : isRecord(snippet?.super_chat_details)
      ? snippet?.super_chat_details
      : undefined;
  const superSticker = isRecord(snippet?.superStickerDetails)
    ? snippet?.superStickerDetails
    : isRecord(snippet?.super_sticker_details)
      ? snippet?.super_sticker_details
      : undefined;
  const superStickerMetadata = isRecord(superSticker?.superStickerMetadata)
    ? superSticker?.superStickerMetadata
    : isRecord(superSticker?.super_sticker_metadata)
      ? superSticker?.super_sticker_metadata
      : undefined;

  return {
    ...value,
    authorDetails: author
      ? {
          ...author,
          channelId: readString(author.channelId) ?? readString(author.channel_id) ?? undefined,
          displayName: readString(author.displayName) ?? readString(author.display_name) ?? undefined,
          profileImageUrl: readString(author.profileImageUrl) ?? readString(author.profile_image_url) ?? undefined,
          isChatSponsor: readBoolean(author.isChatSponsor) ?? readBoolean(author.is_chat_sponsor) ?? undefined,
          isChatModerator: readBoolean(author.isChatModerator) ?? readBoolean(author.is_chat_moderator) ?? undefined,
          isChatOwner: readBoolean(author.isChatOwner) ?? readBoolean(author.is_chat_owner) ?? undefined
        }
      : undefined,
    snippet: snippet
      ? {
          ...snippet,
          displayMessage: readString(snippet.displayMessage) ?? readString(snippet.display_message) ?? undefined,
          publishedAt: readString(snippet.publishedAt) ?? readString(snippet.published_at) ?? undefined,
          type: readString(snippet.type) ?? undefined,
          superChatDetails: superChat
            ? {
                ...superChat,
                amountDisplayString:
                  readString(superChat.amountDisplayString) ?? readString(superChat.amount_display_string) ?? undefined
              }
            : undefined,
          superStickerDetails: superSticker
            ? {
                ...superSticker,
                amountDisplayString:
                  readString(superSticker.amountDisplayString) ?? readString(superSticker.amount_display_string) ?? undefined,
                superStickerMetadata: superStickerMetadata
                  ? {
                      ...superStickerMetadata,
                      altText: readString(superStickerMetadata.altText) ?? readString(superStickerMetadata.alt_text) ?? undefined,
                      altTextLanguage:
                        readString(superStickerMetadata.altTextLanguage) ??
                        readString(superStickerMetadata.alt_text_language) ??
                        undefined,
                      stickerId: readString(superStickerMetadata.stickerId) ?? readString(superStickerMetadata.sticker_id) ?? undefined
                    }
                  : undefined
              }
            : undefined
        }
      : undefined
  } as youtube_v3.Schema$LiveChatMessage;
}

function findCompleteJsonObjectEnd(input: string) {
  if (!input.startsWith("{")) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function stripJsonStreamPrefix(input: string) {
  return input.startsWith(")]}'") ? input.slice(4).trimStart() : input;
}

function extractYouTubeErrorReason(error: unknown) {
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  if (isRecord(data)) {
    if (isRecord(data.error)) {
      const errors = data.error.errors;
      const first = Array.isArray(errors) && isRecord(errors[0]) ? errors[0] : undefined;
      return readString(first?.reason) ?? readString(data.error.reason);
    }
    return readString(data.error) ?? readString(data.reason);
  }
  const errors = isRecord(error) ? error.errors : undefined;
  const first = Array.isArray(errors) && isRecord(errors[0]) ? errors[0] : undefined;
  return readString(first?.reason) ?? (isRecord(error) ? readString(error.reason) : null);
}

function getYouTubeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const data = isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
  if (isRecord(data) && isRecord(data.error)) {
    return readString(data.error.message) ?? "YouTube API request failed.";
  }
  if (isRecord(data)) {
    return readString(data.error_description) ?? readString(data.error) ?? "YouTube API request failed.";
  }
  return "YouTube API request failed.";
}

function getErrorStatus(error: unknown) {
  const status = isRecord(error) && isRecord(error.response) ? error.response.status : undefined;
  return typeof status === "number" ? status : undefined;
}

function isYouTubeDiagnosticError(error: unknown): error is YouTubeDiagnosticError {
  return error instanceof YouTubeDiagnosticError;
}

function isUnauthorizedYouTubeError(error: unknown, reason: string | null) {
  const status = getErrorStatus(error);
  if (status === 401 || reason === "invalid_grant") {
    return true;
  }
  if (reason && unauthorizedYouTubeErrorReasons.has(reason)) {
    return true;
  }
  return false;
}

function isPermissionDeniedYouTubeError(error: unknown, reason: string | null, message: string) {
  const status = getErrorStatus(error);
  if (status !== 403) {
    return false;
  }
  if (reason && permissionDeniedYouTubeErrorReasons.has(reason)) {
    return true;
  }
  const text = `${reason ?? ""} ${message}`.toLowerCase();
  return text.includes("permission") || text.includes("scope");
}

const unauthorizedYouTubeErrorReasons = new Set([
  "authError",
  "authorizationRequired",
  "insufficientAuthentication"
]);

const permissionDeniedYouTubeErrorReasons = new Set([
  "forbidden",
  "insufficientPermission",
  "insufficientPermissions"
]);

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"));
}

function isNetworkLikeError(error: unknown) {
  const status = getErrorStatus(error);
  if (typeof status === "number" && (status >= 500 || status === 408)) {
    return true;
  }

  const reason = extractYouTubeErrorReason(error);
  if (reason && retryableYouTubeErrorReasons.has(reason)) {
    return true;
  }

  const code = extractNetworkReason(error);
  if (code && retryableNetworkCodes.has(code.toUpperCase())) {
    return true;
  }

  if (error instanceof Error) {
    const text = `${error.name} ${error.message}`.toLowerCase();
    return retryableNetworkMessageFragments.some((fragment) => text.includes(fragment));
  }
  return false;
}

const retryableYouTubeErrorReasons = new Set(["backendError", "internalError", "serviceUnavailable"]);

const retryableNetworkCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ERR_NETWORK",
  "ERR_SOCKET_CLOSED",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT"
]);

const retryableNetworkMessageFragments = [
  "network error",
  "socket",
  "fetch failed",
  "connection reset",
  "connection refused",
  "connection closed",
  "connection terminated",
  "connect timeout",
  "read timeout",
  "request timeout",
  "timed out",
  "timeout",
  "econnreset",
  "econnrefused",
  "econnaborted",
  "etimedout",
  "eai_again",
  "enotfound",
  "epipe",
  "tls",
  "transport"
];

function extractNetworkReason(error: unknown): string | undefined {
  const code = isRecord(error) ? readString(error.code) : null;
  if (code) {
    return code;
  }
  const cause = isRecord(error) ? error.cause : undefined;
  if (isRecord(cause)) {
    return readString(cause.code) ?? undefined;
  }
  return undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
