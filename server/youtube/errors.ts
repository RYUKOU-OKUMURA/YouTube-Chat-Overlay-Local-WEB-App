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
