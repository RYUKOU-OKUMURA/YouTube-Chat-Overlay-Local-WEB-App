# 技術スタック
# YouTube Chat Overlay Local WEB App v1.0

## 1. 全体方針

管理画面、OBSオーバーレイ、API、Socket.IOサーバーを1つのローカルWEBアプリとして構築する。

個人利用を前提とし、DB・本格ログイン・SaaS設計は採用しない。
コメント履歴は保存せず、配信中のコメントはアプリ起動中だけメモリ上に保持する。

OBSには `/overlay/{overlayToken}` のURLをBrowser Sourceとして登録する。

## 2. 推奨スタック

### フロントエンド

- Next.js
- React
- TypeScript
- Tailwind CSS
- Framer Motion
- Socket.IO Client

用途:
- 管理画面
- OBSオーバーレイ画面
- コメント一覧表示
- テーマ設定
- 接続状態表示

理由:
- 管理画面とオーバーレイを同一プロジェクトで作れる
- TypeScriptでイベントと状態を安全に扱える
- Tailwind CSSでOBS用の透明背景UIを作りやすい
- Framer Motionでコメントカードの表示アニメーションを作りやすい

## 3. バックエンド

- Node.js
- Next.js Custom Server
- Next.js Route Handlers
- TypeScript

用途:
- APIエンドポイント
- YouTube OAuth処理
- YouTube API連携
- ライブチャットコメント取得ジョブ
- Socket.IOサーバー
- OBSオーバーレイへのイベント配信
- ローカルJSON設定の読み書き

補足:
- Socket.IOを同一ポートで動かすため、Next.js Custom Serverを使う
- サーバーレス構成やVercel前提にはしない
- ローカルPCで `localhost:3000` として起動する

## 4. リアルタイム通信

- Socket.IO

用途:
- 管理画面への新着コメント配信
- 管理画面からOBSオーバーレイへの表示イベント配信
- OBSオーバーレイの接続状態確認
- Socket切断時の自動再接続

イベント例:
- comment:new
- overlay:show
- overlay:hide
- overlay:pin
- overlay:unpin
- overlay:theme:update
- overlay:connected
- overlay:test
- youtube:status

理由:
- WebSocket接続管理がしやすい
- 自動再接続を扱いやすい
- 管理画面とOBSオーバーレイの両方にイベント配信しやすい

## 5. データ管理

DBは使用しない。

### メモリ管理

アプリ起動中のみ以下をメモリに保持する。

- 現在の配信URL
- videoId
- liveChatId
- nextPageToken
- 取得済みコメントID Set
- 最新コメント一覧 100〜300件
- 現在OBSに表示中のコメント
- YouTube接続状態
- OBS接続状態
- コメント取得タイマー

### ローカルJSON保存

必要最小限の設定だけローカルJSONに保存する。

保存先:
- data/settings.json
- data/youtube-token.json

settings.json:
- overlayToken
- theme
- lastBroadcastUrl

youtube-token.json:
- accessToken
- refreshToken
- expiryDate

注意:
- `data/youtube-token.json` はGit管理しない
- コメント履歴は保存しない

## 6. 認証・YouTube OAuth

- Google OAuth 2.0
- YouTube Data API / YouTube Live Streaming API

必要スコープ:
- https://www.googleapis.com/auth/youtube.readonly

用途:
- YouTubeライブ配信情報の取得
- liveChatIdの取得
- ライブチャットコメントの取得

方針:
- アプリ利用者は本人のみ
- 本格ログイン画面は作らない
- 初回だけGoogle認可URLへ遷移する
- OAuthコールバックでトークンを受け取る
- トークンはローカルJSONに保存する
- アクセストークン期限切れ時はリフレッシュする

## 7. YouTube API

使用API:
- YouTube Data API v3
- YouTube Live Streaming API

使用する主な処理:
- videoIdから配信情報取得
- liveStreamingDetails.activeLiveChatIdの取得
- ライブチャットコメント取得

コメント取得方式:
- 第一候補: liveChatMessages.list
- 将来候補: liveChatMessages.streamList

実装方針:
- MVPではliveChatMessages.listでポーリングする
- nextPageTokenを保持する
- pollingIntervalMillisに従って次回取得する
- コメントIDで重複排除する
- エラー時は管理画面に状態を表示する

取得するコメント情報:
- messageId
- authorName
- authorImageUrl
- authorChannelId
- messageText
- messageType
- publishedAt
- isChatOwner
- isChatModerator
- isChatSponsor
- Super Chat関連情報

## 8. OBSオーバーレイ

技術:
- Next.js page
- React
- Tailwind CSS
- Framer Motion
- Socket.IO Client

URL:
- /overlay/{overlayToken}

仕様:
- ログイン不要
- 管理操作不可
- 背景透明
- 1920x1080対応
- 1280x720対応
- Socket.IOでイベント受信
- コメントカードをアニメーション表示
- CSS変数でテーマ反映

OBS Browser Source設定例:
- URL: http://localhost:3000/overlay/{overlayToken}
- Width: 1920
- Height: 1080
- Custom CSS: 原則不要
- Shutdown source when not visible: 任意
- Refresh browser when scene becomes active: 任意

## 9. スタイリング

- Tailwind CSS
- CSS Variables
- Framer Motion

テーマ設定項目:
- fontFamily
- fontSize
- cardWidth
- cardPosition
- borderRadius
- showAvatar
- showAuthorName
- backgroundColor
- textColor
- accentColor
- animationType

初期アニメーション:
- fade-in
- slide-up
- scale-in
- fade-out

## 10. 状態管理

### 管理画面

- React useState
- React useEffect
- Socket.IO events
- 必要に応じてSWRまたはTanStack Query

用途:
- コメント一覧
- 配信情報
- テーマ設定
- 接続状態
- 現在表示中コメント

### オーバーレイ

- React useState
- Socket.IO events

用途:
- 現在表示中コメント
- テーマ設定

### サーバー側

- Node.jsプロセスメモリ
- Map / Set
- タイマー管理
- ローカルJSON読み書き

## 11. バリデーション

- Zod

用途:
- YouTube URL入力チェック
- APIリクエストのバリデーション
- テーマ設定値チェック
- Socket.IO payloadチェック

## 12. セキュリティ

個人利用前提のため、SaaS向けの厳密な権限管理は行わない。

最低限守ること:
- `.env` をGit管理しない
- `data/youtube-token.json` をGit管理しない
- コメント本文をHTMLとして直接描画しない
- Reactの標準エスケープを使う
- overlayTokenをランダム生成する
- オーバーレイ画面から管理APIを実行できないようにする
- 管理画面は基本的にlocalhost利用とする

## 13. ホスティング・実行環境

### MVP開発

- ローカル開発
- Node.js
- pnpm
- localhost:3000

用途:
- 管理画面をブラウザで操作
- OBS Browser SourceでローカルURLを表示
- YouTube OAuth callback確認
- Socket.IO確認

### 任意

- ngrok
- Cloudflare Tunnel

用途:
- OAuthコールバック検証
- 別端末から管理画面を触る場合

注意:
- 基本はローカルPC上で完結させる
- 本番SaaSデプロイは初期対象外

## 14. 開発環境

- Node.js
- pnpm
- TypeScript
- Next.js
- Socket.IO
- Tailwind CSS

ローカル構成:
- app: http://localhost:3000
- websocket: http://localhost:3000/socket.io
- overlay: http://localhost:3000/overlay/{overlayToken}
- admin: http://localhost:3000/admin

不要なもの:
- PostgreSQL
- Prisma
- Docker Compose
- Auth.js
- Sentry
- 課金基盤
- ユーザー管理DB

## 15. テスト

- Vitest
- React Testing Library
- Playwright

優先テスト対象:
- YouTube URLパース
- liveChatId取得処理
- コメント重複排除
- pollingIntervalMillisに従ったポーリング
- Socket.IOイベント送受信
- overlay:showイベント
- overlay:hideイベント
- テーマ反映

## 16. ログ

- console
- pino 任意

ログ対象:
- YouTube OAuth成功/失敗
- 配信URL登録
- liveChatId取得成功/失敗
- コメント取得開始/停止
- YouTube APIエラー
- Socket.IO接続/切断
- OBS overlay接続/切断
- 表示イベント

## 17. ディレクトリ構成案

```text
/app
  /admin
    page.tsx
  /overlay/[overlayToken]
    page.tsx
  /api
    /youtube
      /auth-url/route.ts
      /callback/route.ts
      /status/route.ts
      /disconnect/route.ts
    /broadcast
      /start/route.ts
      /stop/route.ts
      /status/route.ts
    /messages
      /route.ts
      /[messageId]
        /show/route.ts
        /pin/route.ts
    /overlay
      /hide/route.ts
      /unpin/route.ts
    /settings/route.ts
    /test-message/route.ts

/components
  /admin
    BroadcastForm.tsx
    CommentList.tsx
    CommentItem.tsx
    OverlayPreview.tsx
    ThemePanel.tsx
    ConnectionStatus.tsx
  /overlay
    CommentCard.tsx
    OverlayRoot.tsx
  /common
    Button.tsx
    Input.tsx
    Switch.tsx
    Slider.tsx

/server
  /youtube
    oauth.ts
    tokenStore.ts
    getLiveChatId.ts
    fetchLiveChatMessages.ts
    parseYouTubeUrl.ts
    commentPoller.ts
  /realtime
    socketServer.ts
    events.ts
  /state
    appState.ts
    overlayState.ts
    messageStore.ts
  /settings
    settingsStore.ts

/data
  settings.json
  youtube-token.json

/lib
  env.ts
  logger.ts
  validation.ts

/types
  message.ts
  theme.ts
  socket-events.ts
```

## 18. MVP実装順序

### Phase 1: 基礎

1. Next.jsプロジェクト作成
2. TypeScript設定
3. Tailwind CSS設定
4. Custom Server作成
5. Socket.IOサーバー実装
6. 管理画面とオーバーレイ画面の土台作成

### Phase 2: OBS表示

1. /overlay/{overlayToken} 作成
2. 透明背景設定
3. コメントカード作成
4. アニメーション実装
5. テストコメント送信
6. OBS Browser Sourceで表示確認

### Phase 3: リアルタイム操作

1. 管理画面Socket接続
2. オーバーレイSocket接続
3. overlay:show実装
4. overlay:hide実装
5. overlay:pin実装
6. overlay:unpin実装

### Phase 4: YouTube連携

1. YouTube OAuth実装
2. トークンのローカル保存
3. YouTube URLパーサー実装
4. videoIdからliveChatId取得
5. liveChatMessages.listでコメント取得
6. コメント重複排除
7. 管理画面にコメント一覧表示

### Phase 5: 設定

1. テーマ設定
2. settings.json保存
3. overlay:theme:update実装
4. UI調整

### Phase 6: 仕上げ

1. エラー表示
2. 接続状態表示
3. 再接続処理
4. コメント取得停止処理
5. OBS実機テスト
