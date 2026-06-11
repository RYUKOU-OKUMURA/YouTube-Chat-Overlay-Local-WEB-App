import { YouTubeDiagnosticError, type ClassifiedYouTubeError } from "@/server/youtube/errors";
import { isRecord, readString } from "@/server/youtube/internal/values";

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
