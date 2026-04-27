# 技術スタック
# YouTube Chat Overlay Local WEB App v1.0

更新日: 2026-04-27

このドキュメントは、現在の実装に合わせた技術構成メモです。初期案では `liveChatMessages.list` のポーリングを前提にしていましたが、現行実装は `liveChat.messages.stream` を使います。

## 1. 全体方針

管理画面、OBS オーバーレイ、API、Socket.IO サーバーを1つのローカル Web アプリとして構築する。

個人利用を前提とし、DB、本格ログイン、SaaS 設計は採用しない。コメント履歴は保存せず、配信中のコメントはアプリ起動中だけメモリ上に保持する。

OBS には `/overlay/{overlayToken}` の URL を Browser Source として登録する。

## 2. ランタイムと主要ライブラリ

### 実行環境

- Node.js
- Next.js Custom Server
- TypeScript
- localhost 前提

### アプリケーション

- Next.js
- React
- TypeScript
- Tailwind CSS
- Framer Motion
- Socket.IO
- googleapis
- Zod
- lucide-react
- pino

### テスト・開発

- Vitest
- Playwright
- ESLint
- tsx

### バージョン管理上の注意

`package.json` は多くの依存を `latest` 指定している。lockfile 上では Next.js 16.2.4、React 19.2.5、TypeScript 6.0.3 などが解決されている。

`packageManager` は `pnpm@9.15.4` だが、リポジトリには `package-lock.json` があり、README と検証コマンドは npm を使っている。運用上は npm に寄せるか pnpm に寄せるかを次フェーズで統一する。

## 3. アーキテクチャ

```text
Browser /admin
  |
  | REST API + Socket.IO
  v
Next.js Custom Server + Route Handlers
  |
  | appController
  v
In-memory state
  |
  | googleapis OAuth client
  v
YouTube Data API / liveChat.messages.stream

OBS Browser Source /overlay/{overlayToken}
  |
  | Socket.IO
  v
Overlay state and theme updates
```

### Custom Server

`server.ts` で Next.js を prepare し、Node HTTP server に Next request handler と Socket.IO を載せる。

役割:

- `.env` 読み込み
- Next.js アプリ起動
- `appController.init()`
- Socket.IO attach
- `localhost:{PORT}` で listen

### Route Handlers

Next.js App Router の route handler を API として使う。

用途:

- YouTube OAuth
- 配信開始/停止
- 状態取得
- メッセージ一覧
- メッセージ表示
- オーバーレイ非表示
- テストメッセージ
- 設定取得/更新

### AppController

`server/state/appController.ts` がサーバー側の中核。

責務:

- settings 初期化
- YouTube status 管理
- broadcast status 管理
- stream lifecycle 管理
- コメント dedupe
- コメント最大件数制限
- overlay state 管理
- EventEmitter による Socket.IO 連携
- test message 生成
- theme 更新

## 4. ディレクトリ構成

```text
app/
  admin/page.tsx
  overlay/[overlayToken]/page.tsx
  design-samples/page.tsx
  api/
    broadcast/
    messages/
    overlay/
    settings/
    test-message/
    youtube/

components/
  admin/
  common/
  overlay/

server/
  realtime/socketServer.ts
  settings/settingsStore.ts
  state/appController.ts
  youtube/
    api.ts
    oauth.ts
    parseYouTubeUrl.ts
    tokenStore.ts

lib/
  http.ts
  logger.ts
  superChat.ts
  themePresets.ts
  validation.ts

types/
  index.ts

tests/
  unit/
  e2e/

data/
  settings.json
  youtube-token.json
```

## 5. フロントエンド

### 管理画面

技術:

- React client component
- Socket.IO Client
- Tailwind CSS
- lucide-react

主な component:

- `AdminDashboard`
- `ConnectionStrip`
- `OAuthPanel`
- `BroadcastPanel`
- `MessagePanel`
- `OverlayPanel`
- `SettingsPanel`

状態取得:

- 初期ロード時に REST API を並列取得
- Socket.IO 接続後に `admin:subscribe`
- `state:sync` で全体状態を同期

主な UI 状態:

- active tab
- socket connected
- notice
- broadcast URL
- search
- autoscroll
- busy action
- last synced at

### OBS オーバーレイ

技術:

- React client component
- Socket.IO Client
- Tailwind CSS
- Framer Motion

主な component:

- `OverlayClient`
- `OverlayCard`
- `SuperChatCard`

仕様:

- `html` と `body` を transparent background にする
- Socket.IO 接続後に `overlay:subscribe` する
- token 不一致時はサーバー側で切断される
- `state:sync`、`overlay:show`、`overlay:hide`、`overlay:test`、`overlay:theme:update` を受ける
- `AnimatePresence` で表示/非表示を制御する
- 1600x900 未満を compact 扱いにする

## 6. バックエンド

### API routes

YouTube:

- `GET /api/youtube/auth-url`
- `GET /api/youtube/callback`
- `GET /api/youtube/status`
- `POST /api/youtube/disconnect`

Broadcast:

- `POST /api/broadcast/start`
- `POST /api/broadcast/stop`
- `GET /api/broadcast/status`

Messages:

- `GET /api/messages`
- `POST /api/messages/{messageId}/show`

Overlay:

- `POST /api/overlay/hide`

Test:

- `POST /api/test-message`

Settings:

- `GET /api/settings`
- `PATCH /api/settings`

### API response

共通レスポンス型:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } };
```

`jsonOk` と `jsonError` で NextResponse を返す。

## 7. リアルタイム通信

Socket.IO を同一 HTTP server 上の `/socket.io` で動かす。

### Client to Server

- `admin:subscribe`
- `overlay:subscribe`
- `state:request-sync`

### Server to Client

- `state:sync`
- `comment:new`
- `youtube:status`
- `broadcast:status`
- `overlay:connected`
- `overlay:state`
- `overlay:show`
- `overlay:hide`
- `overlay:theme:update`
- `overlay:test`

### Rooms

- 管理画面は `admin` room に入る。
- オーバーレイは `overlay:{overlayToken}` room に入る。

現状、`comment:new`、`youtube:status`、`broadcast:status`、`overlay:connected` は主に admin 向けに送る。`overlay:show`、`overlay:hide`、`overlay:state`、`overlay:test`、`overlay:theme:update` は全体 emit している。

## 8. YouTube API

### OAuth

ライブラリ:

- `googleapis`
- `google.auth.OAuth2`

必要スコープ:

- `https://www.googleapis.com/auth/youtube.readonly`

処理:

- `getAuthUrl()` で Google 認可 URL を生成
- callback の `code` を `client.getToken(code)` で token に交換
- token を `data/youtube-token.json` に保存
- `getAuthorizedClient()` で OAuth client を生成
- `tokens` event で token refresh 結果を保存

現状の制約:

- OAuth `state` は未検証
- `getYouTubeStatus()` は env と token file の存在確認が中心
- token revoke や scope 不足は開始時の API エラーで検知する

### 配信情報取得

使用 API:

- `youtube.videos.list`

取得する part:

- `snippet`
- `liveStreamingDetails`

用途:

- stream title
- channel name
- `liveStreamingDetails.activeLiveChatId`

### コメント取得

使用 API:

- `liveChat.messages.stream`

入力:

- liveChatId
- part: `id`, `snippet`, `authorDetails`
- pageToken
- maxResults: 200
- profileImageSize: 88
- AbortSignal

出力処理:

- JSON object stream を parser で分割
- snake_case と camelCase の差を正規化
- YouTube message を `ChatMessage` に変換
- Super Chat details を `amountText` と `isSuperChat` に反映

### エラー分類

分類:

- quotaExceeded
- rateLimitExceeded
- liveChatEnded
- liveChatDisabled
- liveChatNotFound
- unauthorized
- network
- unknown

network 系のみ retryable として再接続する。quota、rate limit、認可エラー、チャット終了などは停止する。

## 9. データ管理

DB は使用しない。

### メモリ状態

- settings
- messages
- fetchedMessageIds
- nextPageToken
- streamAbortController
- reconnectTimer
- streamGeneration
- reconnectDelayMs
- broadcastStatus
- youtubeStatus
- overlayConnected
- overlayState

### コメント保持

- 最大300件
- 新着は内部配列の先頭へ追加
- UI では古い順から新しい順へ見せる
- dedupe は `platformMessageId` で行う

### ローカル JSON

保存先:

- `data/settings.json`
- `data/youtube-token.json`

`data/settings.json`:

- overlayToken
- theme
- lastBroadcastUrl

`data/youtube-token.json`:

- accessToken
- refreshToken
- expiryDate

注意:

- `data/settings.json` と `data/youtube-token.json` は Git 管理しない
- 書き込みは一時ファイルから rename する atomic write
- settings が存在しない、または壊れている場合はデフォルトを生成する

## 10. バリデーション

ライブラリ:

- Zod

対象:

- theme
- settings
- start broadcast payload
- patch settings payload

色文字列は現状 `string().min(1).max(80)` で、CSS color としての厳密検証はしていない。

## 11. スタイリング

### 管理画面

- Tailwind CSS
- light UI
- lucide-react icons
- common component: Button, Badge, Panel, Field

### OBS オーバーレイ

- Tailwind CSS
- inline style
- Framer Motion
- transparent background
- emoji fallback font

テーマプリセット:

- Midnight Glass
- Clinic Calm Pro
- Warm Pop
- Minimal Broadcast
- Festival Neon
- Comic Pop Voice

Super Chat:

- `lib/superChat.ts` で金額を yen tier に分類
- blue: 1-999
- gold: 1000-4999
- purple: 5000-9999
- red: 10000+
- パースできない金額は gold に fallback

## 12. テスト

### Unit

テスト対象:

- YouTube URL parser
- validation default
- Super Chat amount parser
- YouTube message mapping
- stream parser
- AppController stream lifecycle

コマンド:

```bash
npm test
```

### Type check

通常:

```bash
npx tsc --noEmit
```

TypeScript 6.x の `baseUrl` deprecation で失敗する場合の暫定確認:

```bash
npx tsc --noEmit --ignoreDeprecations 6.0
```

### Build

```bash
npm run build
```

### E2E

```bash
npm run test:e2e
```

E2E は `/admin` と `/overlay/{overlayToken}` を開き、テストコメント、非表示、再表示、テストスパチャを確認する。

## 13. 運用上の注意

- ローカル PC の `localhost:3000` 前提で使う。
- 公開ネットワークに出さない。
- Google OAuth secret は `.env.local` に置く。
- YouTube token は平文保存される。
- quota 使用量は Google Cloud Console で監視する。
- stream 再接続が短時間に繰り返される場合は手動で停止する。
- 依存の `latest` 固定は将来の破壊的変更リスクがある。

## 14. 既知の技術課題

- `startBroadcast` のサーバー側冪等化が不十分
- 配信開始リクエスト競合への保護が限定的
- stream 再接続の回数上限がない
- OAuth `state` 検証がない
- YouTube disconnect 時に既存 stream を必ず停止する連動がない
- `/api/youtube/status` は実 API 疎通確認ではない
- 一部 route の JSON parse error が整形済み API error にならない可能性がある
- 色入力の CSS 妥当性検証がない
- npm/pnpm の運用方針が混在している
- 依存バージョン固定が不十分
