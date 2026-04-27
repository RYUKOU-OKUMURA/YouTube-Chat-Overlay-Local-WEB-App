# 要件定義
# YouTube Chat Overlay Local WEB App v1.0

更新日: 2026-04-28

このドキュメントは、現在の実装に合わせた現状仕様です。初期案に含まれていた polling、pin/unpin、表示秒数、自動消去などは現行仕様から外れています。

## 1. プロダクト概要

YouTube Live のコメントを取得し、配信者が管理画面で選んだコメントだけを OBS Browser Source に表示するローカル専用 Web アプリ。

管理画面、API、Socket.IO、OBS オーバーレイを1つのローカルアプリとして動かす。DB、ログイン、SaaS 向けユーザー管理、コメント履歴保存は持たない。

## 2. 目的

- YouTube Live の視聴者コメントを配信画面上に読みやすく表示する
- 配信者が手動で「出したいコメント」だけを選べるようにする
- OBS Browser Source で透明背景のコメントカードを表示する
- Super Chat を通常コメントより強く視認できるカードで表示する
- 配信中でもテーマや表示位置を調整できるようにする
- 個人利用のローカルツールとして軽く動かす

## 3. 対象範囲

### 対象に含める

- YouTube OAuth 接続
- OAuth トークンのローカル保存
- YouTube Live URL 入力
- URL から videoId 抽出
- YouTube Data API による配信情報取得
- activeLiveChatId の取得
- `liveChat.messages.stream` によるライブチャット取得
- 上限付き stream 再接続
- コメント一覧表示
- コメント検索
- 未表示/重要コメントの表示切替
- 最新コメント追従 ON/OFF
- コメントカードクリック表示
- コメントの「表示」ボタン
- コメントの「コピー」ボタン
- 現在表示中コメントの確認
- コメントの非表示
- 表示済みラベル
- メンバー、モデレーター、配信者、Super Chat の区別
- テストコメント送信
- テストスパチャ送信
- OBS 用 overlay URL の発行とコピー
- 透明背景の OBS オーバーレイ
- 通常コメントカード表示
- Super Chat 専用カード表示
- CSS/Framer Motion による表示アニメーション
- テーマプリセット
- フォント、文字サイズ、カード幅、位置、角丸、色、アニメーション、アイコン表示、投稿者名表示の調整
- 長文コメント向けの文字サイズ自動調整
- 接続状態表示
- Socket.IO による状態同期

### 対象に含めない

- DB 保存
- コメント履歴の永続保存
- ユーザーアカウント管理
- 本格ログイン
- 管理トークン
- 複数ユーザー対応
- 複数モデレーター権限
- SaaS 向け権限管理
- 課金
- Twitch、TikTok Live、ニコ生などの他プラットフォーム対応
- Chrome 拡張
- OBS ネイティブプラグイン
- AI コメント要約
- コメント読み上げ
- 自動コメント表示
- pin/unpin
- 表示秒数による自動消去
- 配信アーカイブ分析

## 4. 想定ユーザー

- YouTube Live 配信者本人
- OBS を使って配信している個人クリエイター
- 配信 PC 上でローカルツールとしてコメント表示を制御したい人

## 5. 基本フロー

### 初回セットアップ

1. ユーザーが依存関係をインストールする。
2. `.env.local` に Google OAuth クライアント情報を設定する。
3. アプリを `localhost:3000` で起動する。
4. 管理画面 `/admin` を開く。
5. YouTube OAuth に接続する。
6. OBS 用 overlay URL をコピーする。
7. OBS Browser Source に overlay URL を設定する。
8. テストコメントまたはテストスパチャで表示を確認する。

### 配信中

1. 管理画面に YouTube Live URL を入力する。
2. 「開始」を押す。
3. アプリが videoId を抽出し、YouTube API で liveChatId を取得する。
4. アプリが `liveChat.messages.stream` でコメント取得を開始する。
5. 新着コメントが管理画面の一覧に追加される。
6. 配信者が表示したいコメントをクリック、または「表示」を押す。
7. OBS オーバーレイにコメントカードが表示される。
8. 表示したコメントは次の表示または「非表示」まで残る。
9. 配信後、必要に応じて「停止」を押す。

## 6. 画面要件

### 6.1 管理画面

URL:

- `/`
- `/admin`

`/` は `/admin` へリダイレクトする。

画面構成:

- ヘッダー
- 接続状態バー
- 通知メッセージ
- 操作画面タブ
- 管理・設定タブ

ヘッダー機能:

- 状態更新
- テストコメント送信
- テストスパチャ送信
- OBS URL コピー

操作画面タブ:

- ライブチャット操作
- コメント検索
- 最新へ追従 ON/OFF
- コメント一覧
- コメントカードクリック表示
- コメント表示ボタン
- コメントコピー
- 現在の OBS 表示確認
- 非表示

管理・設定タブ:

- YouTube OAuth 接続/再接続
- YouTube 接続解除
- YouTube Live URL 入力
- コメント取得開始
- コメント取得停止
- 配信タイトル表示
- チャンネル名表示
- videoId 表示
- liveChatId 表示
- 最終取得時刻表示
- 最終受信時刻表示
- OBS URL コピー
- 現在の OBS 表示確認
- テーマ設定

接続状態バーの表示:

- Socket 接続中/再接続中
- OBS 接続中/未接続
- YouTube OAuth 認可済み/未認可
- YouTube API 接続中/未接続/エラー
- stream 接続中/接続済み/再接続中/停止中/終了/エラー
- refresh token 不足時の再接続推奨
- ライブ未開始/配信終了/チャット無効/認可不足/応答形式エラー/通信エラーの案内
- 最終同期時刻

コメント一覧の表示項目:

- 投稿者名
- 投稿者アイコン
- コメント本文
- 投稿日時
- コメント種別
- メンバー判定
- モデレーター判定
- 配信者判定
- Super Chat 判定
- Super Chat 金額
- 表示中ラベル
- 表示済みラベル
- 未表示件数
- 最新ラベル

### 6.2 OBS オーバーレイ画面

URL:

- `/overlay/{overlayToken}`

用途:

- OBS Browser Source 専用
- 通常ユーザーが操作しない表示専用ページ

機能:

- 透明背景
- Socket.IO 接続
- overlay token の検証
- state sync 受信
- 表示イベント受信
- 非表示イベント受信
- テスト表示イベント受信
- テーマ更新イベント受信
- 通常コメントカード表示
- Super Chat 専用カード表示
- 表示/非表示アニメーション
- compact レイアウト

表示仕様:

- 背景は透明
- 1920x1080 を主対象にする
- 1280x720 などの小さめのキャンバスにも対応する
- コメントは最大行数で折り返す
- 長文は必要に応じて文字サイズ自動調整できる
- 絵文字を表示できる
- 投稿者アイコンを表示できる
- 投稿者名を表示できる
- メンバー、モデレーター、配信者、Super Chat、テスト表示のバッジを表示できる

## 7. 機能要件

### FR-001 YouTube OAuth

- ユーザーは管理画面から YouTube OAuth 接続を開始できる。
- OAuth URL はサーバーで生成する。
- OAuth callback で認可コードを受け取り、Google OAuth token に交換する。
- 取得した token は `data/youtube-token.json` に保存する。
- 保存済み token がある場合、管理画面には認可済みとして表示する。
- アクセストークン更新時は refresh token を使う。
- refresh 時に新しい refresh token が返らない場合、既存 refresh token を維持する。
- YouTube status は `hasRefreshToken`、`accessTokenExpiresAt`、`needsReconnect` を返す。
- refresh token がない認可済み状態では、管理画面に再接続推奨を表示する。
- `invalid_grant`、401、403 permission/scope 系のエラーは再接続案内に寄せる。
- OAuth `state` 検証は現状未実装とする。

### FR-002 YouTube Live URL 登録

- ユーザーは YouTube Live URL または 11文字の videoId を入力できる。
- アプリは `youtube.com/watch?v=...`、`youtu.be/...`、`/live/...`、`/shorts/...`、`/embed/...` から videoId を抽出できる。
- videoId が抽出できない場合はエラーを返す。
- videoId から YouTube API で配信情報を取得する。
- `snippet.liveBroadcastContent` と `liveStreamingDetails` を使い、動画不明/アクセス不可、ライブ未開始、終了済み、ライブ動画ではない、ライブチャット無効を分類する。
- `scheduledStartTime`、`actualStartTime`、`actualEndTime` を broadcast status に保持する。
- activeLiveChatId が取得できない場合は、状態に応じて `LIVE_NOT_STARTED`、`LIVE_ENDED`、`LIVE_CHAT_DISABLED`、`YOUTUBE_PERMISSION_DENIED`、`YOUTUBE_RESPONSE_ERROR` などを返す。

### FR-003 コメント取得

- コメント取得方式は `liveChat.messages.stream` とする。
- stream 開始時に liveChatId、pageToken、AbortSignal を渡す。
- stream から受け取った JSON をパースし、コメント一覧へ正規化する。
- nextPageToken を保持し、再接続時に利用する。
- 新着コメントは管理画面へ `comment:new` で配信する。
- 同一 `platformMessageId` は重複表示しない。
- コメント一覧はメモリ上に最大300件保持する。
- 最大300件を超える場合は、未表示 Super Chat、未表示の配信者/モデレーター/メンバー、未表示通常、表示済み重要、表示済み通常の順で優先保持する。
- offlineAt を受け取った場合は配信終了扱いにして取得を止める。
- network 系エラーは指数バックオフで最大8回まで再接続する。
- 再接続バックオフは初期2秒、最大60秒とする。
- 短時間 close が5回続く場合は `connectionState: "error"` で停止する。
- 正常 batch 受信時は再接続カウンタをリセットする。
- quota、rate limit、認可エラー、チャット終了、parser/応答形式エラーなどは terminal error として停止する。
- `BroadcastStatus` は `errorKind`、`errorReason`、`errorPhase`、`errorAction` を保持する。

### FR-004 コメント一覧

- 管理画面では古いコメントから新しいコメントへ下に流れる見た目にする。
- 内部状態では新しいコメントを先頭に保持してよい。
- 検索対象は投稿者名、本文、金額、種別、投稿日時とする。
- コメントカード全体のクリックで表示できる。
- 「表示」ボタンでも表示できる。
- 「コピー」ボタンで本文をクリップボードへコピーできる。
- 表示したコメントには `displayedAt` を付与し、表示済みラベルを出す。
- コメント一覧は `すべて`、`未表示`、`重要` で表示切替できる。
- 未表示件数を管理画面に表示する。

### FR-005 OBS 表示

- 配信者がコメントを表示すると、サーバーは overlay state の currentMessage を更新する。
- Socket.IO で overlay:show と overlay:state を配信する。
- OBS オーバーレイは currentMessage をコメントカードとして表示する。
- 表示したコメントは自動で消えない。
- 次のコメントを表示すると置き換わる。
- 管理画面は full `AppState` を受けるが、OBS オーバーレイは `OverlayState` のみを受ける。

### FR-006 OBS 非表示

- 配信者は現在表示中のコメントを非表示にできる。
- 非表示時は currentMessage を null にする。
- Socket.IO で overlay:hide と overlay:state を配信する。
- OBS オーバーレイはカードを消す。

### FR-007 テスト表示

- ユーザーは YouTube API 未接続でもテストコメントを送信できる。
- ユーザーは YouTube API 未接続でもテストスパチャを送信できる。
- テストコメントはコメント一覧に追加され、OBS に即時表示される。
- テストスパチャは Super Chat 専用カードで表示される。
- テストスパチャのデフォルト金額は `¥1,000` とする。

### FR-008 テーマ設定

- ユーザーはテーマプリセットを選択できる。
- テーマ変更は `data/settings.json` に保存する。
- テーマ変更は OBS オーバーレイへリアルタイム反映する。
- 設定項目は以下とする。

設定項目:

- stylePreset
- fontFamily
- fontSize
- autoFitText
- cardWidth
- cardPosition
- borderRadius
- showAvatar
- showAuthorName
- backgroundColor
- textColor
- accentColor
- animationType

プリセット:

- Midnight Glass
- Clinic Calm Pro
- Warm Pop
- Minimal Broadcast
- Festival Neon
- Comic Pop Voice

### FR-009 Overlay URL

- アプリは `overlayToken` をローカル設定として保持する。
- 設定が存在しない場合はランダムな token を生成する。
- overlay URL は `/overlay/{overlayToken}` とする。
- overlay token が一致しない Socket.IO 購読は切断する。
- overlay URL から管理操作は提供しない。

### FR-010 接続状態

- 管理画面は Socket 接続状態を表示する。
- 管理画面は OBS overlay 接続状態を表示する。
- 管理画面は YouTube OAuth/API 状態を表示する。
- 管理画面は broadcast stream 状態を表示する。
- 管理画面は最終同期時刻を表示する。
- Socket sync が一定時間届かない場合だけ `/api/state` の full snapshot に fallback する。
- Socket 接続中の手動再同期は `state:request-sync` を使う。

### FR-011 配信開始制御

- 同一 videoId の取得中に開始が再実行された場合、既存の broadcast status を返す。
- 開始処理はサーバー側の in-flight queue で直列化する。
- 古い開始リクエストの結果が新しい stream を上書きしないようにする。
- YouTube 接続解除時は token 削除前にコメント取得を停止し、broadcast status を停止状態へ同期する。

## 8. API 要件

### YouTube

- `GET /api/youtube/auth-url`
- `GET /api/youtube/callback`
- `GET /api/youtube/status`
- `POST /api/youtube/disconnect`

### Broadcast

- `POST /api/broadcast/start`
- `POST /api/broadcast/stop`
- `GET /api/broadcast/status`

### Messages

- `GET /api/messages`
- `POST /api/messages/{messageId}/show`

### Overlay

- `POST /api/overlay/hide`

### Test

- `POST /api/test-message`

### Settings

- `GET /api/settings`
- `PATCH /api/settings`

## 9. Socket.IO イベント要件

### Client to Server

- `admin:subscribe`
- `overlay:subscribe`
- `state:request-sync`

### Server to Client

- `state:sync`
- `overlay:sync`
- `comment:new`
- `youtube:status`
- `broadcast:status`
- `overlay:connected`
- `overlay:state`
- `overlay:show`
- `overlay:hide`
- `overlay:theme:update`
- `overlay:test`

## 10. データ要件

### メモリ保持

アプリ起動中のみ保持する。

- overlayToken
- messages
- fetchedMessageIds
- nextPageToken
- current overlay state
- YouTube status
- broadcast status
- overlay connected
- stream abort controller
- reconnect timer
- reconnect attempt
- max reconnect attempts
- next reconnect at

### ChatMessage

- id
- platformMessageId
- authorName
- authorImageUrl
- authorChannelId
- messageText
- messageType
- isMember
- isModerator
- isOwner
- isSuperChat
- amountText
- publishedAt
- displayedAt

### Settings

- overlayToken
- theme
- lastBroadcastUrl

### YouTubeToken

- accessToken
- refreshToken
- expiryDate

## 11. 非機能要件

### パフォーマンス

- 管理画面のコメント一覧は最大300件に制限する。
- 最大300件の範囲内で、未表示コメントと重要コメントを優先保持する。
- OBS オーバーレイは表示アニメーション中も配信画面で重くなりにくい実装にする。
- テーマ変更は Socket.IO で即時反映する。

### 可用性

- Socket.IO はクライアント側の自動再接続に任せる。
- YouTube stream が network 系エラーで閉じた場合は上限付きでバックオフ再接続する。
- parser/応答形式エラーは network 再接続扱いにせず停止する。
- 配信終了を検知した場合は取得を停止する。

### セキュリティ

- ローカル利用前提とし、管理画面/API/socket の認証は持たない。
- 公開サーバー、LAN、VPN、トンネルでは使わない。
- OAuth secret は `.env.local` に置く。
- OAuth token は `data/youtube-token.json` に保存し、Git 管理しない。
- コメント本文を HTML として直接描画しない。
- overlayToken は推測しづらいランダム文字列にする。

### プライバシー

- コメント履歴は保存しない。
- コメントはアプリ起動中のメモリだけに保持する。
- アプリ終了時にコメント一覧は消える。

## 12. 受け入れ条件

- ローカルでアプリを起動できる。
- `/admin` を開ける。
- YouTube OAuth 接続を開始できる。
- 認可済み状態を表示できる。
- YouTube Live URL から videoId を抽出できる。
- liveChatId を取得できる。
- stream でコメントを取得できる。
- 管理画面にコメント一覧が表示される。
- 同一コメントが重複表示されない。
- コメントカードクリックまたは「表示」で OBS に表示できる。
- 表示したコメントが自動で消えない。
- 「非表示」で OBS から消せる。
- テストコメントを表示できる。
- テストスパチャを Super Chat 専用カードで表示できる。
- テーマ変更が OBS に反映される。
- コメント履歴が永続保存されない。
- 開始ボタン連打や別タブ操作でも stream が二重開始しない。
- YouTube 接続解除時に既存 stream が停止する。
- stream 再接続が上限に達した場合、管理画面にエラーとして表示される。
- 壊れた JSON の API request body は `VALIDATION_ERROR` として返る。
- OBS オーバーレイは full message list を受け取らない。

## 13. 現状の既知制約

- OAuth `state` 検証は未実装。
- YouTube status は token/env 確認が中心で、実 API 疎通確認ではない。
- 色入力は CSS color としての厳密検証をしていない。
- 依存バージョンは `latest` 指定が多い。
