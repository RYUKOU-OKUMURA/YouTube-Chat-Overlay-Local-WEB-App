# YouTube Chat Overlay Local WEB App

YouTube Live のコメントを取得し、配信者が選んだコメントを OBS Browser Source に表示するローカル専用 Web アプリです。

## Local Only

このアプリは個人のローカル PC で使う前提です。管理画面/API にログインや管理トークンはありません。

- `localhost:3000` で起動して使ってください。
- LAN、VPN、トンネル、公開サーバーには公開しないでください。
- OBS Browser Source には同じ PC から `http://localhost:3000/overlay/{overlayToken}` を指定してください。
- `data/youtube-token.json` には YouTube OAuth トークンが平文で保存されます。

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

OBS 用 URL は管理画面の「OBS URLをコピー」から取得できます。

## OBS Browser Source

OBS の Browser Source に次のように設定します。

- URL: 管理画面でコピーした `/overlay/{overlayToken}` URL
- Width: `1920`
- Height: `1080`
- Custom CSS: 原則不要
- 背景: アプリ側で透明化

## Usage

1. 管理画面で YouTube OAuth 接続を行う。
2. YouTube Live URL を入力してコメント取得を開始する。
3. OBS Browser Source に overlay URL を設定する。
4. コメント一覧の「表示」で一時表示、「固定」で固定表示する。
5. 固定表示は「固定解除」で通常表示に戻り、設定した表示秒数後に消える。
6. 表示秒数は「管理・設定」タブの「表示秒数」で 3〜60 秒に設定する。

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```

macOS の sandbox や CI 環境によっては Playwright Chromium が起動できない場合があります。その場合は `npm run test:e2e` の失敗内容を記録し、unit/type/lint/build を必須確認にしてください。

## Known Limitations

- 管理画面/API/socket に認証はありません。ローカル専用です。
- YouTube API の quota/backoff、配信終了検知、OAuth state 検証は次フェーズの対象です。
- 依存バージョンは一部 `latest` 指定のままです。再現性を高める固定化は次フェーズの対象です。
- `npm audit --omit=dev` では Next/PostCSS 経由の moderate advisory が報告されます。`npm audit fix --force` は破壊的な Next ダウングレードを提案するため、このタスクでは適用していません。
