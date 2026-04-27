# 要件定義
# YouTube Chat Overlay Local WEB App v1.0

## 1. プロダクト概要

YouTubeライブ配信中のコメントをYouTube APIで取得し、配信者が選択したコメントをOBS画面上にポップアップ表示できるローカル利用向けWEBアプリを作る。

OBS側には専用のオーバーレイURLをBrowser Sourceとして追加する。
配信者は管理画面からコメントを確認し、任意のコメントを表示・非表示できる。

本アプリは個人利用を前提とし、DB、本格ログイン、SaaS向けユーザー管理、コメント履歴保存は行わない。

## 2. 目的

- YouTubeライブ配信中の視聴者コメントをOBS上にわかりやすく表示する
- 配信者が手動で「出したいコメント」だけを選べるようにする
- OBS Browser Sourceで透明背景のコメントカードを表示する
- 簡易テーマを管理画面から調整できるようにする
- ローカル環境で軽く動く個人用ツールとして完成させる

## 3. MVPの対象範囲

### 対象に含める

- YouTubeライブ配信URLの入力
- URLからvideoIdを抽出
- YouTube APIによる配信情報取得
- liveChatIdの取得
- YouTubeライブコメントのリアルタイム取得
- コメント一覧表示
- コメントの手動表示
- コメントの非表示
- 簡易テーマ設定
- OBS用オーバーレイURLの発行
- 透明背景のOBSオーバーレイ表示
- コメントカードのアニメーション表示
- テストコメント送信
- 接続状態の表示
- YouTube OAuthの初回認可
- OAuthトークンのローカル保存

### 対象に含めない

- DB保存
- コメント履歴保存
- ユーザーアカウント管理
- 本格ログイン画面
- 複数ユーザー対応
- 複数モデレーター管理
- SaaS向け権限管理
- 課金機能
- Twitch対応
- TikTok Live対応
- ニコ生対応
- Chrome拡張機能
- OBSネイティブプラグイン
- AIコメント要約
- コメント読み上げ
- Super Chat専用演出
- 配信アーカイブ分析

## 4. 想定ユーザー

- YouTubeライブ配信者本人
- OBSを使って配信している個人クリエイター
- ローカルPC上でコメント表示ツールを動かしたい配信者

## 5. 基本ユーザーフロー

### 初回セットアップ

1. ユーザーがローカルWEBアプリを起動する
2. 管理画面を開く
3. 必要に応じてYouTube OAuth認可を行う
4. YouTubeライブ配信URLを入力する
5. アプリがvideoIdを抽出する
6. YouTube APIでliveChatIdを取得する
7. コメント取得を開始する
8. OBS用オーバーレイURLをコピーする
9. OBSのBrowser SourceにURLを追加する
10. テストコメントを表示して動作確認する

### 配信中の操作

1. 管理画面にコメントがリアルタイム表示される
2. 配信者が表示したいコメントを選ぶ
3. コメントカードまたは「表示」ボタンを押す
4. OBSオーバーレイにコメントカードが表示される
5. 表示したコメントは次の表示または「非表示」まで残る
6. 必要に応じて「非表示」を実行する

## 6. 画面要件

## 6.1 管理画面

URL:
- /
- /admin

機能:
- YouTubeライブ配信URL入力
- YouTube OAuth接続状態表示
- コメント取得開始
- コメント取得停止
- コメント一覧表示
- コメント検索
- コメント自動スクロールON/OFF
- コメントカードクリック表示
- コメント表示ボタン
- コメント非表示ボタン
- 現在OBSに表示中のコメント確認
- テストコメント送信
- オーバーレイURLコピー
- 接続状態表示
- テーマ設定

表示項目:
- 配信タイトル
- チャンネル名
- 配信URL
- liveChatId取得状態
- YouTube API接続状態
- コメント取得状態
- OBSオーバーレイ接続状態
- 最終コメント取得時刻

コメント一覧の表示項目:
- 投稿者名
- 投稿者アイコン
- コメント本文
- 投稿日時
- メンバー判定
- モデレーター判定
- オーナー判定
- Super Chat判定
- 表示済み判定

コメント操作:
- 表示
- 非表示
- コピー

## 6.2 オーバーレイ画面

URL:
- /overlay/{overlayToken}

用途:
- OBS Browser Source専用
- 通常ユーザーが操作しない表示専用ページ

機能:
- 透明背景
- コメントカード表示
- CSSアニメーション
- Socket.IO接続
- 表示イベント受信
- 非表示イベント受信
- テーマ反映

表示仕様:
- 背景は透明
- OBSの1920x1080キャンバスに対応
- 1280x720にも対応
- コメントが長い場合は最大行数で折り返す
- 絵文字を表示できる
- 投稿者アイコンを表示できる
- 投稿者名を表示できる
- コメント本文を表示できる

## 7. 機能要件

### FR-001 YouTube接続

- ユーザーはYouTube API利用のために初回OAuth認可を行える
- 認可済みの場合は保存済みトークンを利用する
- アクセストークン期限切れ時はリフレッシュトークンで更新する
- 認可失敗時は管理画面にエラーを表示する

### FR-002 配信URL登録

- ユーザーはYouTubeライブ配信URLを入力できる
- アプリはURLからvideoIdを抽出する
- アプリはYouTube APIで対象配信の情報を取得する
- アプリはliveChatIdを取得する
- liveChatIdが存在しない場合はエラーを表示する

### FR-003 コメント取得

- アプリはYouTubeライブチャットからコメントを取得する
- 取得方式はまずliveChatMessages.listのポーリングを使う
- YouTube APIのpollingIntervalMillisに従って次回取得する
- 新着コメントを管理画面に追加する
- 同一コメントIDは重複表示しない
- コメント一覧はメモリ上に最新100〜300件程度だけ保持する
- 配信終了時はコメント取得を停止する

### FR-004 コメント一覧

- 管理画面にコメントを新着順または到着順で表示する
- 投稿者名を表示する
- 投稿者アイコンを表示する
- コメント本文を表示する
- メンバー、モデレーター、配信者コメントを区別できる
- 表示済みコメントには表示済みラベルを付ける

### FR-005 コメント表示

- 配信者は任意のコメントカードまたは「表示」ボタンを押せる
- 表示ボタン押下後、OBSオーバーレイへ表示イベントを送る
- OBSオーバーレイはコメントカードを表示する
- 表示したコメントは次の表示または「非表示」操作まで残る

### FR-006 コメント非表示

- 配信者は現在表示中のコメントを非表示にできる
- 非表示操作後、OBSオーバーレイからコメントカードを消す

### FR-007 テーマ変更

- 配信者はコメントカードの簡易テーマを変更できる
- テーマ変更はOBSオーバーレイに反映される
- 初期テーマを1つ用意する

初期テーマ:
- カード型
- 投稿者アイコンあり
- 投稿者名あり
- コメント本文あり
- 角丸
- ドロップシャドウ
- フェードイン・フェードアウト

### FR-008 オーバーレイURL発行

- アプリ起動時または初回設定時にOBS用オーバーレイURLを発行する
- オーバーレイURLはランダムなoverlayTokenを含む
- オーバーレイURLはログインなしで表示できる
- オーバーレイURLでは管理操作はできない

### FR-011 テストコメント

- 管理画面からテストコメントを送信できる
- OBSオーバーレイにテストコメントが表示される
- YouTube API未接続時でも表示確認できる

### FR-012 接続状態表示

管理画面に以下の状態を表示する。

- YouTube OAuth認可済み / 未認可
- YouTube API接続中 / 切断
- コメント取得中 / 停止
- OBSオーバーレイ接続中 / 未接続
- Socket.IO接続中 / 切断

### FR-013 エラーハンドリング

以下のエラーを画面に表示する。

- YouTube OAuth失敗
- 配信URL不正
- videoId未取得
- liveChatId未取得
- コメント取得失敗
- API制限到達
- OBSオーバーレイ未接続
- Socket.IO切断
- 配信終了
- チャット無効

## 8. 非機能要件

### パフォーマンス

- 管理画面のコメント表示はスムーズに動作すること
- 管理画面からOBSオーバーレイへの表示反映は可能な限り即時に行う
- コメント一覧はメモリ上で最新100〜300件程度に制限する
- OBSオーバーレイは配信画面上でカクつかないこと

### 可用性

- Socket.IO切断時に自動再接続する
- YouTube API接続が切れた場合は管理画面に状態を表示する
- 配信終了時に安全にコメント取得を停止する

### セキュリティ

個人利用のためSaaS向けの厳密な権限管理は行わない。
ただし、最低限以下は守る。

- APIキーやOAuthクライアントシークレットは`.env`に置く
- OAuthトークンはローカルファイルに保存し、Git管理しない
- コメント本文をHTMLとして直接描画しない
- overlayTokenは推測されにくいランダム文字列にする
- オーバーレイURLから管理操作を実行できないようにする

### プライバシー

- コメント履歴は保存しない
- コメントはアプリ起動中のみメモリ上に保持する
- アプリ終了時にコメント一覧は消える

### OBS互換性

- OBS Browser Sourceで表示できること
- 背景が透明であること
- 1920x1080でレイアウトが崩れないこと
- 1280x720でレイアウトが崩れないこと
- URLを貼るだけで使えること

## 9. データ要件

DBは使用しない。
アプリの状態はメモリとローカルJSONファイルで管理する。

### メモリ上で保持する状態

#### AppState

- overlayToken
- currentBroadcastUrl
- currentVideoId
- liveChatId
- nextPageToken
- pollingTimer
- isFetchingComments
- youtubeStatus
- overlayConnected
- lastFetchedAt

#### ChatMessage

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

#### OverlayState

- currentMessage
- theme

#### DeduplicationState

- fetchedMessageIds

### ローカルJSONに保存する設定

保存先:
- data/settings.json
- data/youtube-token.json

#### settings.json

- overlayToken
- theme
- lastBroadcastUrl

#### youtube-token.json

- accessToken
- refreshToken
- expiryDate

## 10. API要件

### YouTube接続

- GET /api/youtube/auth-url
- GET /api/youtube/callback
- GET /api/youtube/status
- POST /api/youtube/disconnect

### 配信・コメント

- POST /api/broadcast/start
- POST /api/broadcast/stop
- GET /api/broadcast/status
- GET /api/messages
- POST /api/messages/{messageId}/show
- POST /api/messages/{messageId}/pin
- POST /api/overlay/hide
- POST /api/overlay/unpin
- POST /api/test-message

### 設定

- GET /api/settings
- PATCH /api/settings

### オーバーレイ

- GET /overlay/{overlayToken}
- Socket.IO /socket.io

## 11. Socket.IOイベント要件

### 管理画面向けイベント

event: comment:new

payload:
- messageId
- authorName
- authorImageUrl
- messageText
- publishedAt
- badges

event: youtube:status

payload:
- status
- reason

event: overlay:connected

payload:
- connected
- connectedAt

event: overlay:state

payload:
- currentMessage

### OBSオーバーレイ向けイベント

event: overlay:show

payload:
- messageId
- authorName
- authorImageUrl
- messageText
- badges
- theme

event: overlay:hide

payload:
- messageId

event: overlay:theme:update

payload:
- theme

event: overlay:test

payload:
- authorName
- authorImageUrl
- messageText
- theme

## 12. 受け入れ条件

### YouTube接続

- 初回OAuth認可ができる
- 認可済み状態が管理画面に表示される
- YouTubeライブ配信URLを入力すると配信情報が表示される
- liveChatIdが取得できる
- liveChatIdが取得できない場合はエラーが表示される

### コメント取得

- 配信中のコメントが管理画面に表示される
- 新着コメントが重複せず追加される
- コメント取得状態が画面に表示される
- アプリ終了後にコメント履歴が残らない

### OBS表示

- OBS Browser SourceにオーバーレイURLを貼ると透明背景で表示される
- 管理画面でコメントカードまたは「表示」を押すとOBS上にコメントが表示される
- 表示したコメントは自動では消えない
- 「非表示」を押すと即座に消える

### テーマ・設定

- テーマ設定を変更するとOBS表示に反映される
- 設定は必要最小限だけローカルJSONに保存される

## 13. 初期リリースの完成条件

- ローカルでアプリを起動できる
- YouTube OAuth認可ができる
- YouTubeライブ配信URLを登録できる
- liveChatIdを取得できる
- コメントをリアルタイム取得できる
- 管理画面にコメント一覧が出る
- コメントを手動でOBSに表示できる
- OBS側で透明背景のコメントカードが表示される
- 非表示ができる
- テストコメントでOBS表示確認ができる
