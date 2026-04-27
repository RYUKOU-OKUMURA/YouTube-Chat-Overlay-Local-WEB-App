# YouTube Chat Overlay Local WEB App

YouTube Live のコメントを取得し、配信者が選んだコメントだけを OBS Browser Source に表示するローカル専用 Web アプリです。

管理画面でコメントを確認し、表示したいコメントをクリックまたは「表示」ボタンで OBS オーバーレイに出します。表示したコメントは自動では消えず、次のコメント表示または「非表示」まで残ります。

## Local Only

このアプリは個人のローカル PC で使う前提です。管理画面、API、Socket.IO にログインや管理トークンはありません。

- `localhost:3000` で起動して使ってください。
- LAN、VPN、トンネル、公開サーバーには公開しないでください。
- OBS Browser Source には同じ PC から `http://localhost:3000/overlay/{overlayToken}` を指定してください。
- `data/youtube-token.json` には YouTube OAuth トークンが平文で保存されます。

## Features

- YouTube OAuth 接続
- YouTube Live URL から videoId を抽出
- YouTube Data API で liveChatId、配信タイトル、チャンネル名を取得
- `liveChat.messages.stream` によるライブチャット取得
- コメント一覧のリアルタイム更新
- コメント検索、最新追従、表示済みラベル
- コメントの手動表示、非表示、本文コピー
- OBS 用 overlay URL の発行とコピー
- 透明背景の OBS オーバーレイ
- 通常コメントカードと Super Chat 専用カード
- テストコメント、テストスパチャ
- テーマプリセットと表示調整
- Socket.IO による管理画面、オーバーレイ間の同期

## Setup

```bash
npm install
cp .env.example .env.local
```

`.env.local` に Google OAuth の値を設定します。

```bash
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/youtube/callback
PORT=3000
```

Google Cloud Console では YouTube Data API v3 を有効化し、OAuth クライアントの承認済みリダイレクト URI に `http://localhost:3000/api/youtube/callback` を登録してください。

## Run

開発起動:

```bash
npm run dev
```

本番ビルド:

```bash
npm run build
npm start
```

管理画面:

```text
http://localhost:3000/admin
```

`/` は `/admin` へリダイレクトされます。

## OBS Browser Source

管理画面の「OBS URLをコピー」から overlay URL を取得し、OBS の Browser Source に設定します。

- URL: `http://localhost:3000/overlay/{overlayToken}`
- Width: `1920`
- Height: `1080`
- Custom CSS: 原則不要
- 背景: アプリ側で透明化

1280x720 などの小さめのキャンバスにも対応するため、オーバーレイ側では表示領域に応じた compact レイアウトを使います。

## Usage

1. 管理画面を開く。
2. YouTube OAuth に接続する。
3. YouTube Live URL を入力して「開始」を押す。
4. OBS Browser Source に overlay URL を設定する。
5. 必要なら「テストコメント」または「テストスパチャ」で表示確認する。
6. コメント一覧で表示したいコメントをクリック、または「表示」を押す。
7. 消したい場合は「非表示」を押す。
8. 配信後は「停止」を押す。

## Current Behavior

- コメント取得はポーリングではなく stream 方式です。
- コメント履歴は保存しません。アプリ起動中のメモリに最大300件だけ保持します。
- 同一 `platformMessageId` は重複表示しません。
- 表示したコメントは自動消去されません。
- pin/unpin、表示秒数、複数モデレーター、ユーザー管理はありません。
- YouTube 接続状態は token/env の確認が中心で、軽量な実 API 疎通確認は行っていません。

## Local Data

Git 管理しないローカルファイル:

- `data/settings.json`
  - `overlayToken`
  - `theme`
  - `lastBroadcastUrl`
- `data/youtube-token.json`
  - `accessToken`
  - `refreshToken`
  - `expiryDate`

`data/settings.json` が存在しない、または壊れている場合は、起動時にデフォルト設定を生成します。

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

現状の TypeScript 6.x では `baseUrl` の deprecation により `npx tsc --noEmit` が失敗する場合があります。その場合は暫定確認として次を使えます。

```bash
npx tsc --noEmit --ignoreDeprecations 6.0
```

macOS の sandbox や CI 環境によっては Playwright Chromium が起動できない、またはアニメーション待ちで E2E がフレークする場合があります。その場合は失敗内容を記録し、unit/type/build の結果と合わせて判断してください。

## Known Limitations

- 管理画面、API、Socket.IO に認証はありません。ローカル専用です。
- OAuth `state` 検証は未実装です。
- YouTube 接続解除時に既存 stream を明示停止する連動は未整備です。
- 配信開始 API はサーバー側で完全には冪等化されていません。
- stream 再接続の上限や quota 保護は今後の改善対象です。
- 依存バージョンは `latest` 指定が多く、再現性の固定化は今後の改善対象です。

## Documents

- 要件定義: `docs-md-staging/requirements.md`
- 技術スタック: `docs-md-staging/tech-stack.md`
- 現状リスク: `docs-md-staging/current-risks-and-mitigations.md`
