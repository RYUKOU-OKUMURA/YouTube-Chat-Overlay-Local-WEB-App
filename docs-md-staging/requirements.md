# 要件定義
# YouTube Chat Overlay WEB App v1.0

## 1. プロダクト概要

YouTubeライブ配信中のコメントをWEBアプリで取得し、配信者が選択したコメントをOBS画面上にポップアップ表示できるツールを作る。

OBS側には専用のオーバーレイURLをBrowser Sourceとして追加する。
配信者は管理画面からコメントを確認し、任意のコメントを表示・非表示・固定表示できる。

## 2. 目的

- YouTubeライブ配信中に視聴者コメントを画面上にわかりやすく表示する
- OBS上で透明背景のコメントカードを表示する
- 配信者が手動で「出したいコメント」だけを選べるようにする
- デザイン、表示秒数、固定表示などをWEB管理画面から調整できるようにする
- 将来的にTwitch、TikTok Live、Chrome拡張、AI要約、コメント読み上げに拡張できる構造にする

## 3. MVPの対象範囲

### 対象に含める

- ユーザーログイン
- Google / YouTube連携
- YouTubeライブ配信URLの入力
- 配信URLから対象配信を識別
- liveChatIdの取得
- YouTubeライブコメントの取得
- コメント一覧表示
- コメントの手動表示
- コメントの非表示
- コメントの固定表示
- コメントカードのテーマ変更
- 表示秒数の変更
- OBS用オーバーレイURLの発行
- 透明背景のOBSオーバーレイ表示
- コメントカードのアニメーション表示
- テストコメント送信
- 接続状態の表示

### 対象に含めない

- Twitch対応
- TikTok Live対応
- ニコ生対応
- Chrome拡張機能
- OBSネイティブプラグイン
- 複数モデレーター管理
- 課金機能
- AIコメント要約
- コメント読み上げ
- Super Chat専用演出
- 複数レイアウトのマーケットプレイス
- 配信アーカイブ分析

## 4. 想定ユーザー

### メインユーザー

- YouTubeライブ配信者
- OBSを使って配信している個人クリエイター
- コメントを画面上に目立たせたい配信者

### サブユーザー

- 配信補助スタッフ
- モデレーター
- オンラインイベント運営者

## 5. 基本ユーザーフロー

### 初回セットアップ

1. ユーザーがWEBアプリにアクセスする
2. Googleアカウントでログインする
3. YouTube連携を許可する
4. ダッシュボードを開く
5. YouTubeライブ配信URLを入力する
6. アプリが対象配信を識別する
7. コメント取得を開始する
8. OBS用オーバーレイURLをコピーする
9. OBSのBrowser SourceにURLを追加する
10. テストコメントを表示して動作確認する

### 配信中の操作

1. 管理画面にコメントがリアルタイム表示される
2. 配信者が表示したいコメントを選ぶ
3. 「表示」ボタンを押す
4. OBSオーバーレイにコメントカードが表示される
5. 指定秒数後に自動で消える
6. 必要に応じて「固定表示」または「非表示」を実行する

## 6. 画面要件

## 6.1 ログイン画面

URL:
- /login

機能:
- Googleログインボタン
- 利用規約・プライバシーポリシーリンク
- ログイン失敗時のエラー表示

## 6.2 ダッシュボード画面

URL:
- /dashboard

機能:
- 接続済みYouTubeアカウント表示
- 新しい配信を登録するボタン
- 最近使った配信一覧
- オーバーレイURL再表示
- 配信ステータス表示

表示項目:
- 配信タイトル
- 配信URL
- 作成日時
- コメント取得状態
- 最終コメント取得時刻

## 6.3 配信登録画面

URL:
- /broadcasts/new

機能:
- YouTube配信URL入力
- URLバリデーション
- 配信情報の取得
- 配信タイトル表示
- 配信開始日時表示
- コメント取得開始ボタン

入力:
- YouTubeライブ配信URL

出力:
- 配信タイトル
- チャンネル名
- サムネイル
- 配信ステータス
- liveChatId取得状態

## 6.4 管理画面

URL:
- /rooms/{roomId}/admin

機能:
- コメント一覧表示
- コメント検索
- コメント自動スクロールON/OFF
- コメント表示ボタン
- コメント非表示ボタン
- コメント固定表示ボタン
- 固定解除ボタン
- 現在OBSに表示中のコメント確認
- テストコメント送信
- オーバーレイURLコピー
- 接続状態表示
- テーマ設定
- 表示秒数設定

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
- 固定表示
- 非表示
- 再表示
- コピー

## 6.5 オーバーレイ画面

URL:
- /overlay/{overlayToken}

用途:
- OBS Browser Source専用
- 通常ユーザーが操作しない表示専用ページ

機能:
- 透明背景
- コメントカード表示
- CSSアニメーション
- WebSocket接続
- 表示イベント受信
- 非表示イベント受信
- 固定表示イベント受信
- テーマ反映
- 表示秒数反映

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

### FR-001 ログイン

- ユーザーはGoogleアカウントでログインできる
- ログイン後、ダッシュボードへ遷移する
- 未ログインユーザーは管理画面へアクセスできない

### FR-002 YouTube連携

- ユーザーはYouTube Data APIへのアクセスを許可できる
- 必要最小限の権限のみを要求する
- アクセストークンを安全に管理する
- リフレッシュトークンを暗号化して保存する

### FR-003 配信URL登録

- ユーザーはYouTubeライブ配信URLを入力できる
- アプリはURLからvideoIdを抽出する
- アプリは対象配信の情報を取得する
- アプリはliveChatIdを取得する
- liveChatIdが存在しない場合はエラーを表示する

### FR-004 コメント取得

- アプリはYouTubeライブチャットからコメントを取得する
- 新着コメントを管理画面に追加する
- 同一コメントIDは重複登録しない
- 接続切断時は自動再接続する
- 配信終了時はコメント取得を停止する

### FR-005 コメント一覧

- 管理画面にコメントを新着順で表示する
- 投稿者名を表示する
- 投稿者アイコンを表示する
- コメント本文を表示する
- メンバー、モデレーター、配信者コメントを区別できる
- 表示済みコメントには表示済みラベルを付ける

### FR-006 コメント表示

- 配信者は任意のコメントの「表示」ボタンを押せる
- 表示ボタン押下後、OBSオーバーレイへ表示イベントを送る
- OBSオーバーレイはコメントカードを表示する
- 表示秒数が経過したら自動で非表示にする

### FR-007 コメント非表示

- 配信者は現在表示中のコメントを非表示にできる
- 非表示操作後、OBSオーバーレイからコメントカードを消す

### FR-008 固定表示

- 配信者は任意のコメントを固定表示できる
- 固定表示中は表示秒数が経過しても消えない
- 固定解除ボタンで通常状態に戻せる

### FR-009 テーマ変更

- 配信者はコメントカードのテーマを変更できる
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

### FR-010 表示秒数変更

- 配信者はコメントの表示秒数を変更できる
- 初期値は8秒
- 設定範囲は3秒から60秒
- 固定表示中は表示秒数を無視する

### FR-011 オーバーレイURL発行

- 配信ごとにOBS用オーバーレイURLを発行する
- オーバーレイURLは推測されにくいトークンを含む
- オーバーレイURLはログインなしで表示できる
- オーバーレイURLでは管理操作はできない

### FR-012 テストコメント

- 管理画面からテストコメントを送信できる
- OBSオーバーレイにテストコメントが表示される
- YouTube API未接続時でも表示確認できる

### FR-013 接続状態表示

管理画面に以下の状態を表示する。

- YouTube API接続中
- YouTube API切断
- コメント取得中
- コメント取得停止
- OBSオーバーレイ接続中
- OBSオーバーレイ未接続

### FR-014 エラーハンドリング

以下のエラーを画面に表示する。

- Googleログイン失敗
- YouTube連携失敗
- 配信URL不正
- liveChatId未取得
- コメント取得失敗
- API制限到達
- OBSオーバーレイ未接続
- WebSocket切断

## 8. 非機能要件

### パフォーマンス

- 管理画面のコメント表示はスムーズに動作すること
- 管理画面からOBSオーバーレイへの表示反映は可能な限り即時に行う
- コメント一覧は大量コメント時でも重くなりすぎないよう仮想リスト化を検討する
- OBSオーバーレイは配信画面上でカクつかないこと

### 可用性

- WebSocket切断時に自動再接続する
- YouTube API接続が切れた場合に再接続する
- 配信終了時に安全にコメント取得を停止する

### セキュリティ

- 管理画面はログイン必須
- オーバーレイURLはランダムトークンで保護する
- オーバーレイURLから管理APIを実行できない
- OAuthトークンは暗号化して保存する
- APIキーやシークレットはサーバー側で管理する
- XSS対策としてコメント本文をHTMLとして直接描画しない
- CORSを必要最小限に制限する

### プライバシー

- コメント保存は必要最小限にする
- コメント履歴の保存期間を設定する
- 初期版ではコメント履歴を長期保存しない
- 削除機能を用意する

### OBS互換性

- OBS Browser Sourceで表示できること
- 背景が透明であること
- 1920x1080でレイアウトが崩れないこと
- 1280x720でレイアウトが崩れないこと
- URLを貼るだけで使えること

## 9. データ要件

### User

- id
- name
- email
- image
- createdAt
- updatedAt

### YouTubeAccount

- id
- userId
- googleAccountId
- channelId
- channelTitle
- accessTokenEncrypted
- refreshTokenEncrypted
- tokenExpiresAt
- createdAt
- updatedAt

### BroadcastRoom

- id
- userId
- youtubeAccountId
- youtubeVideoId
- youtubeLiveChatId
- title
- thumbnailUrl
- status
- overlayToken
- createdAt
- updatedAt

### ChatMessage

- id
- roomId
- platform
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
- createdAt

### OverlayState

- id
- roomId
- currentMessageId
- isPinned
- displayDurationSec
- themeId
- updatedAt

### ThemeSetting

- id
- roomId
- themeName
- fontFamily
- fontSize
- cardWidth
- cardPosition
- showAvatar
- showAuthorName
- animationType
- createdAt
- updatedAt

## 10. API要件

### 認証系

- GET /api/auth/login
- GET /api/auth/callback
- POST /api/auth/logout
- GET /api/me

### YouTube連携

- GET /api/youtube/accounts
- POST /api/youtube/connect
- POST /api/youtube/disconnect

### 配信ルーム

- POST /api/rooms
- GET /api/rooms
- GET /api/rooms/{roomId}
- DELETE /api/rooms/{roomId}

### コメント

- GET /api/rooms/{roomId}/messages
- POST /api/rooms/{roomId}/messages/{messageId}/show
- POST /api/rooms/{roomId}/messages/{messageId}/pin
- POST /api/rooms/{roomId}/messages/{messageId}/hide
- POST /api/rooms/{roomId}/test-message

### オーバーレイ

- GET /overlay/{overlayToken}
- WS /ws/rooms/{roomId}
- WS /ws/overlay/{overlayToken}

### 設定

- GET /api/rooms/{roomId}/settings
- PATCH /api/rooms/{roomId}/settings
- GET /api/rooms/{roomId}/theme
- PATCH /api/rooms/{roomId}/theme

## 11. WebSocketイベント要件

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

### OBSオーバーレイ向けイベント

event: overlay:show

payload:
- messageId
- authorName
- authorImageUrl
- messageText
- badges
- displayDurationSec
- theme

event: overlay:hide

payload:
- messageId

event: overlay:pin

payload:
- messageId
- authorName
- authorImageUrl
- messageText
- badges
- theme

event: overlay:unpin

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

## 12. 受け入れ条件

### ログイン

- Googleログイン後にダッシュボードへ遷移できる
- 未ログイン状態で管理画面へアクセスするとログイン画面へ遷移する

### 配信登録

- YouTubeライブ配信URLを入力すると配信情報が表示される
- liveChatIdが取得できる
- liveChatIdが取得できない場合はエラーが表示される

### コメント取得

- 配信中のコメントが管理画面に表示される
- 新着コメントが重複せず追加される
- コメント取得状態が画面に表示される

### OBS表示

- OBS Browser SourceにオーバーレイURLを貼ると透明背景で表示される
- 管理画面で「表示」を押すとOBS上にコメントが表示される
- 指定秒数後にコメントが消える
- 「非表示」を押すと即座に消える
- 「固定表示」を押すと消えずに残る
- 「固定解除」を押すと通常表示に戻る

### テーマ

- テーマ設定を変更するとOBS表示に反映される
- 表示秒数を変更すると次回表示から反映される

## 13. 初期リリースの完成条件

- ログインできる
- YouTubeライブ配信URLを登録できる
- コメントを取得できる
- 管理画面にコメント一覧が出る
- コメントを手動でOBSに表示できる
- OBS側で透明背景のコメントカードが表示される
- 表示秒数を変更できる
- 固定表示と非表示ができる
- テストコメントでOBS表示確認ができる
