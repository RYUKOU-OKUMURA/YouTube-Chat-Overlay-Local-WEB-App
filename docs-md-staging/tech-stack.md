# 技術スタック
# YouTube Chat Overlay WEB App v1.0

## 1. 全体方針

フロントエンド、管理画面、OBSオーバーレイ、APIを1つのWebアプリとして構築する。

リアルタイム通信が必要なため、WebSocketを扱えるNode.js常駐サーバー構成にする。
OBSには `/overlay/{overlayToken}` のURLをBrowser Sourceとして登録する。

## 2. 推奨スタック

### フロントエンド

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion

用途:
- ログイン画面
- ダッシュボード
- 配信登録画面
- 管理画面
- OBSオーバーレイ画面

理由:
- 管理画面とオーバーレイを同一プロジェクトで作れる
- TypeScriptで安全に開発できる
- Tailwind CSSでOBS用デザインを作りやすい
- Framer Motionでコメントカードのアニメーションを作りやすい

## 3. バックエンド

- Node.js
- Next.js Route Handlers
- Custom Server
- TypeScript

用途:
- APIエンドポイント
- YouTube API連携
- OAuth処理
- コメント取得ジョブ
- WebSocketサーバー
- OBSオーバーレイへのイベント配信

補足:
- WebSocket常時接続が必要なため、サーバーレス専用構成にはしない
- 最初はNext.js + Custom Serverでまとめる
- 将来的にバックエンドだけNestJSやFastifyへ分離してもよい

## 4. リアルタイム通信

- Socket.IO

用途:
- 管理画面への新着コメント配信
- 管理画面からOBSオーバーレイへの表示イベント配信
- OBSオーバーレイの接続状態確認
- 自動再接続

イベント例:
- comment:new
- overlay:show
- overlay:hide
- overlay:pin
- overlay:unpin
- overlay:theme:update
- overlay:connected
- youtube:status

理由:
- WebSocket接続管理がしやすい
- 自動再接続を扱いやすい
- 管理画面とOBSオーバーレイの両方に配信しやすい

## 5. データベース

- PostgreSQL

用途:
- ユーザー情報
- YouTube連携情報
- 配信ルーム情報
- オーバーレイトークン
- コメント履歴
- 表示状態
- テーマ設定

理由:
- SaaS化しやすい
- 将来的な課金、チーム、複数配信管理に拡張しやすい
- コメントや配信ルームのリレーション管理がしやすい

## 6. ORM

- Prisma

用途:
- DBスキーマ管理
- マイグレーション
- 型安全なDBアクセス

理由:
- TypeScriptとの相性がいい
- User、BroadcastRoom、ChatMessageなどのモデル管理がしやすい
- MVP開発が速い

## 7. 認証

- Auth.js
- Google OAuth

用途:
- Googleログイン
- セッション管理
- YouTube Data APIのOAuth連携

必要スコープ:
- https://www.googleapis.com/auth/youtube.readonly

将来必要になり得るスコープ:
- https://www.googleapis.com/auth/youtube.force-ssl

方針:
- 初期版では読み取り中心にする
- 必要以上の権限を要求しない
- リフレッシュトークンは暗号化してDB保存する
- アクセストークンの期限切れ時に更新する

## 8. YouTube API

使用API:
- YouTube Data API v3
- YouTube Live Streaming API

使用する主な処理:
- 配信情報取得
- liveChatId取得
- ライブチャットコメント取得

コメント取得方式:
- 第一候補: liveChatMessages.streamList
- 第二候補: liveChatMessages.list

実装方針:
- streamListが安定して使える場合はstreamListを使う
- 実装や運用で扱いづらい場合はlistでポーリングする
- listを使う場合はnextPageTokenとpollingIntervalMillisを使う
- コメントIDで重複排除する
- APIエラー時は管理画面に状態を表示する

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

## 9. OBSオーバーレイ

技術:
- Next.js page
- React
- CSS
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
- WebSocketでイベント受信
- コメントカードをアニメーション表示
- CSSでテーマ反映

OBS Browser Source設定例:
- URL: https://example.com/overlay/{overlayToken}
- Width: 1920
- Height: 1080
- Custom CSS: 原則不要
- Shutdown source when not visible: 任意
- Refresh browser when scene becomes active: 任意

## 10. スタイリング

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
- displayDurationSec

初期アニメーション:
- fade-in
- slide-up
- scale-in
- fade-out

## 11. 状態管理

### 管理画面

- React useState
- React Query / TanStack Query
- Socket.IO events

用途:
- コメント一覧
- 配信ルーム情報
- テーマ設定
- 接続状態
- 現在表示中コメント

### オーバーレイ

- React useState
- Socket.IO events

用途:
- 現在表示中コメント
- 固定表示状態
- テーマ設定
- 表示タイマー

## 12. バリデーション

- Zod

用途:
- APIリクエストのバリデーション
- YouTube URL入力チェック
- テーマ設定値チェック
- 表示秒数チェック
- WebSocket payloadチェック

## 13. セキュリティ

使用技術:
- Auth.js session
- CSRF対策
- HTTP Only Cookie
- OAuth state検証
- 環境変数管理
- トークン暗号化
- DOMPurifyまたはReact標準エスケープ

方針:
- コメント本文をHTMLとして描画しない
- APIキーをフロントに出さない
- overlayTokenは十分長いランダム文字列にする
- overlayTokenから管理APIを実行できないようにする
- 管理APIはログイン必須にする
- WebSocket接続時にroomIdと権限を検証する

## 14. ホスティング

### MVP開発

- ローカル開発
- Docker Compose
- PostgreSQL local
- ngrok / Cloudflare Tunnel

用途:
- OBSでローカルURLを表示確認
- OAuth callback確認
- WebSocket確認

### 本番候補

- Node.js常駐サーバーを動かせる環境
- PostgreSQLを利用できる環境
- HTTPSを使える環境
- WebSocketを安定して扱える環境

候補:
- Railway
- Render
- Fly.io
- Google Cloud Run
- AWS ECS
- VPS

注意:
- WebSocketを使うため、常時接続に向いた環境を選ぶ
- OBS Browser Sourceで使うためHTTPS対応が望ましい
- ローカル専用アプリとして配る場合はElectron化も検討できる

## 15. 開発環境

- Node.js
- pnpm
- Docker
- Docker Compose
- PostgreSQL
- Prisma CLI
- ngrok or Cloudflare Tunnel

ローカル構成:
- app: localhost:3000
- websocket: localhost:3000
- db: localhost:5432
- overlay: http://localhost:3000/overlay/{overlayToken}
- admin: http://localhost:3000/rooms/{roomId}/admin

## 16. テスト

- Vitest
- React Testing Library
- Playwright

テスト対象:
- YouTube URLパース
- liveChatId取得処理
- コメント重複排除
- WebSocketイベント送受信
- overlay:showイベント
- overlay:hideイベント
- 表示秒数タイマー
- テーマ反映
- 認証ガード
- APIバリデーション

## 17. ログ・監視

- pino
- Sentry
- Basic access logs

ログ対象:
- ログイン成功/失敗
- YouTube連携成功/失敗
- 配信登録
- コメント取得開始/停止
- YouTube APIエラー
- WebSocket接続/切断
- OBS overlay接続/切断
- 表示イベント

## 18. ディレクトリ構成案

```text
/app
  /login
  /dashboard
  /broadcasts/new
  /rooms/[roomId]/admin
  /overlay/[overlayToken]
  /api
    /rooms
    /youtube
    /settings
    /auth

/components
  /admin
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
    Modal.tsx

/server
  /youtube
    getLiveChatId.ts
    fetchLiveChatMessages.ts
    streamLiveChatMessages.ts
    parseYouTubeUrl.ts
  /realtime
    socketServer.ts
    events.ts
  /auth
    googleOAuth.ts
    tokenCrypto.ts
  /rooms
    roomService.ts
  /messages
    messageService.ts

/prisma
  schema.prisma
  migrations

/lib
  env.ts
  db.ts
  logger.ts
  validation.ts

/types
  message.ts
  room.ts
  theme.ts
  socket-events.ts
```

## 19. MVP実装順序

### Phase 1: 基礎

1. Next.jsプロジェクト作成
2. TypeScript設定
3. Tailwind CSS設定
4. Prisma設定
5. PostgreSQL接続
6. Auth.jsでGoogleログイン実装

### Phase 2: 配信登録

1. YouTube URLパーサー実装
2. YouTube API連携
3. liveChatId取得
4. BroadcastRoom作成
5. overlayToken発行

### Phase 3: コメント取得

1. コメント取得サービス実装
2. コメント重複排除
3. ChatMessage保存
4. 管理画面にコメント一覧表示
5. 接続状態表示

### Phase 4: OBSオーバーレイ

1. /overlay/{overlayToken} 作成
2. 透明背景設定
3. コメントカード作成
4. アニメーション実装
5. OBS Browser Sourceで表示確認

### Phase 5: リアルタイム表示

1. Socket.IOサーバー実装
2. 管理画面Socket接続
3. オーバーレイSocket接続
4. overlay:show実装
5. overlay:hide実装
6. overlay:pin実装
7. テストコメント実装

### Phase 6: 設定

1. 表示秒数設定
2. テーマ設定
3. テーマのDB保存
4. overlay:theme:update実装
5. UI調整

### Phase 7: 仕上げ

1. エラー表示
2. ログ追加
3. 再接続処理
4. セキュリティ確認
5. OBS実機テスト
6. 本番デプロイ
