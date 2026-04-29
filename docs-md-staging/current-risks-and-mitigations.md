# 現状の課題・懸念点と優先対応

更新日: 2026-04-28

このドキュメントは、現在の実装調査と 2 時間程度の YouTube Live 運用想定をもとに、今本当に対応すべきことを整理したものです。

想定する運用:

- 配信時間は最低 2 時間。
- 平均視聴者数は約 45 人。
- そのうち約 15 人が継続的にコメントする。
- 配信者は管理画面でコメントを拾い、OBS オーバーレイへポップアップ表示しながら会話する。

結論として、現在のコメント取得方式は `liveChatMessages.list` の短間隔 polling ではなく `liveChat.messages.stream` なので、2 時間配信でコメントを受け続ける設計方針としては妥当です。初回調査時点で最大の不安だった「開始処理の競合」「再接続の暴走」「OAuth/接続解除との状態不整合」「未表示コメントを拾いきる操作性」に加え、早めに直したい P1/P2 の「parser/応答形式エラー分類」「ライブ状態の文言改善」「初期 REST と Socket sync の競合」「Socket 全体同期の絞り込み」「手動視聴者数更新のクールダウン」「重複除去IDの上限」「不正 JSON の API エラー整形」も 2026-04-28 時点で実装済みです。

## 優先度の見方

- P0: 配信中の停止、二重取得、quota 消費増、状態破壊に直結するため最優先で直す。
- P1: 2 時間運用でストレスや取りこぼしにつながりやすいため早めに直す。
- P2: 条件付きで問題化する。P0/P1 の後に改善する。
- P3: 保守性、案内、将来リスクの改善。今すぐの配信安定性には直結しにくい。

## 今すぐやるべきこと

| 状況 | 優先度 | 対応 | なぜ今必要か | 実装内容 |
| --- | --- | --- | --- | --- |
| 実装済み | P0 | `startBroadcast` のサーバー側冪等化と競合制御 | `getLiveChatInfo()` 後に既存 stream を reset すると、連打・別タブ・遅いリクエストの逆転で stream 張り直しや状態上書きが起きる可能性があった。 | 同一 `videoId` の取得中開始は既存 `broadcastStatus` を返す。開始処理を in-flight queue で直列化し、古い開始リクエストの結果が新しい stream を上書きしないようにした。 |
| 実装済み | P0 | stream 再接続ポリシーの強化 | stream が短時間で閉じ続けると、`liveChat.messages.stream` を張り直し続け、API quota 消費増と不安定表示につながる。 | 再接続は最大 8 回、初期 2 秒、最大 60 秒に制限。5 秒未満の短時間 close が 5 回続いたら、batch 受信の有無にかかわらず `connectionState: "error"` で停止する。5 秒以上継続した stream だけを安定接続として再接続カウンタとバックオフをリセットする。 |
| 実装済み | P0 | YouTube 接続解除時に stream を必ず停止する | UI は未認可なのにコメント取得が続く状態不整合が起き得た。 | `/api/youtube/disconnect` で token 削除前に `appController.stopBroadcast()` を呼び、broadcast status を停止状態へ同期する。 |
| 実装済み | P1 | 未表示コメントを拾いやすくする運用キュー | 2 時間で 300 件を超える可能性が高く、配信者が追いつかないと古い未表示コメントが流れる。 | メモリ保持は 300 件のまま、未表示 Super Chat、未表示の配信者/モデレーター/メンバー、未表示通常、表示済み重要、表示済み通常の順で優先保持する。管理画面に `すべて`、`未表示`、`重要` の表示切替と未表示件数を追加した。 |
| 実装済み | P1 | 認可切れ・refresh token 不足の検知と案内 | token revoke、期限切れ、scope 不足を開始時まで検知しにくく、配信開始直前に失敗すると復旧が面倒だった。 | `YouTubeStatus` に `hasRefreshToken`、`accessTokenExpiresAt`、`needsReconnect` を追加。refresh token が無い認可済み状態では `再接続推奨` を表示する。`invalid_grant`、401、403 permission/scope 系は再接続案内に寄せる。 |

実装確認:

- `npm test`: 12 files / 70 tests passed
- `npx tsc --noEmit --ignoreDeprecations 6.0`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test:e2e -- tests/e2e/admin-overlay-smoke.spec.ts`: Playwright Chromium が macOS sandbox の `bootstrap_check_in ... Permission denied (1100)` で起動できず未完了
- in-app browser smoke: 管理画面を開き、テストコメントが管理画面と overlay に表示されることを確認
- `git diff --check`: passed

## 今すぐの P0 ではないが早めに直したいこと

| 状況 | 優先度 | 対応 | 影響 | 実装内容 |
| --- | --- | --- | --- | --- |
| 実装済み | P1 | parser/応答形式エラーを network 再接続と分ける | JSON parse や normalize 不整合まで retryable 扱いになると、実装不整合で再接続を繰り返す可能性があった。 | `YouTubeStreamParserError`、`YouTubeStreamTruncatedError`、`YouTubeStreamResponseShapeError` を追加し、stream JSON の途中終了は `retryable: true` の一時的な network error として再接続する一方、完全なJSONのparse失敗や応答形式エラーは `retryable: false` の terminal error として停止するようにした。`stream` という文字列だけでは network 扱いにせず、HTTP 5xx、408、`ECONNRESET`、`ETIMEDOUT`、socket/transport 系など明確な通信エラーだけ再接続対象にした。`BroadcastStatus` に `errorKind`、`errorReason`、`errorPhase`、`errorAction` を追加し、管理画面で「応答形式エラー」「通信エラー」などを分けて表示する。 |
| 実装済み | P1 | ライブ未開始・終了・チャット無効の文言改善 | `activeLiveChatId was not found` だけだと、配信者が何を直せばよいか分かりにくかった。 | `videos.list` の `snippet.liveBroadcastContent` と `liveStreamingDetails` から、動画不明/アクセス不可、ライブ未開始、終了済み、ライブ動画ではない、ライブチャット無効を判定するようにした。`scheduledStartTime`、`actualStartTime`、`actualEndTime` も `BroadcastStatus` に保持し、管理画面の配信パネルに「ライブ未開始」「配信終了」「チャット確認」「YouTube認可確認」などの日本語案内と次に取る操作を表示する。開始 API は `LIVE_NOT_STARTED`、`LIVE_ENDED`、`LIVE_CHAT_DISABLED`、`YOUTUBE_PERMISSION_DENIED`、`YOUTUBE_RESPONSE_ERROR` などの code/status を返す。 |
| 実装済み | P2 | 初期 REST 読み込みと Socket sync の競合整理 | 管理画面ロード直後に古い REST 結果が新しい Socket 状態を上書きすると、OBS 接続や表示中コメントが一瞬ずれる可能性があった。 | 管理画面の初期状態は Socket `state:sync` を正本に寄せた。Socket sync が一定時間届かない場合だけ `/api/state` の full snapshot を fallback として読む。Socket sync 受信後は fallback を abort し、遅れて返った REST 結果で状態を巻き戻さないようにした。手動の再同期も Socket 接続中は `state:request-sync` を使い、未接続時だけ `/api/state` に fallback する。 |
| 実装済み | P2 | Socket の全体同期を少し絞る | `state:sync` は最大 300 件の messages を全体 emit していた。ローカル利用では大問題ではないが、OBS 側には不要な情報が多かった。 | Socket を admin room と overlay room に分けた。`state:sync` は admin の full `AppState` 専用にし、overlay には新規 `overlay:sync` で `OverlayState` だけを送る。overlay には `messages`、`youtubeStatus`、`broadcastStatus`、`overlayToken` を送らない。`overlay:theme:update` も `Settings` 全体ではなく `{ theme }` だけを送る。`comment:new`、YouTube status、broadcast status、overlay connected は admin room のみに維持した。 |
| 実装済み | P2 | コメント流入中の Socket payload を差分化する | コメント batch ごとに full `AppState` を管理画面へ再送すると、最大 300 件の配列再送と React 再描画が増える。 | 初回接続・明示同期・復旧時は `state:sync` を使い、通常のコメント流入中は `comment:new` と `broadcast:status` の差分イベントで管理画面を更新する。OBS 側も `overlay:show`、`overlay:hide`、`overlay:test`、`overlay:theme:update` の専用イベントに寄せ、`state:sync` 由来の重複 overlay sync を送らない。 |
| 実装済み | P2 | 手動視聴者数更新の quota 消費を抑える | API route を直接叩くとクライアント側 `busy` を迂回し、`videos.list` を短時間に連打できた。 | `refreshViewerMetrics()` のサーバー側で直近 `checkedAt` から 3 分未満の手動更新は既存値を返し、YouTube API を呼ばない。自動更新、手動更新とも in-flight は 1 本にまとめる。 |
| 実装済み | P2 | 重複除去IDのメモリ上限を設ける | `fetchedMessageIds` が配信中に単調増加すると、長時間配信でメモリが増え続ける。 | 重複除去IDは LRU 風のキューで最大 1000 件に制限する。画面保持の 300 件、Super Chat 100 件とは別に、直近重複を抑えるための余白を持たせる。 |
| 実装済み | P2 | 不正 JSON の API エラー整形 | 空 body や壊れた JSON で route 例外になる可能性があった。通常利用では起きにくいが、保守性は落ちていた。 | `lib/http.ts` に zod schema 付き `parseJsonBody()` を追加した。壊れた JSON、空 body、body 読み取り失敗、schema 不一致は `VALIDATION_ERROR` の 422 へ統一し、`SyntaxError` の詳細は外へ出さない。`/api/broadcast/start`、`/api/settings`、`/api/test-message` に適用した。`/api/test-message` だけは従来どおり空 body を `{}` として通常テストコメント送信に使う。 |

## 後回しでよいこと

| 優先度 | 対応 | 理由 |
| --- | --- | --- |
| P2 | OAuth `state` 検証 | セキュリティ上は入れるべきだが、このアプリはローカル専用で管理画面/APIも公開しない前提。配信安定性の P0/P1 より後でよい。 |
| P3 | 依存バージョンの `latest` 固定解除 | 将来の再 install で破壊的変更を踏むリスクはあるが、現在の配信中トラブルには直結しにくい。lockfile と build が通っている間は後回し可能。 |
| P3 | token/settings 破損時の詳細案内 | 壊れた JSON を未認可扱いにするため原因は分かりにくいが、頻度は高くない。ログと UI 案内の改善として扱う。 |
| P3 | 設定入力中の即 PATCH 改善 | テーマ調整中の小さなストレス要因。配信中に頻繁に触らないなら優先度は低い。 |
| P3 | 低遅延・完全リアルタイムではない旨の明文化 | YouTube 側、ネットワーク、Socket、React 描画に依存する。仕様説明としては必要だが、先に実装ガードを固める。 |

## コメント量への評価

現在の実装は、2 時間の配信でコメントを受け続ける方針としては大きく外れていません。

- `liveChat.messages.stream` を使っているため、短間隔 polling より配信向き。
- `nextPageToken` を保持して再接続に使っている。
- `platformMessageId` で重複除去しており、重複除去IDも最大 1000 件に制限している。
- 管理画面の保持件数は最大 300 件に制限されており、メモリと描画負荷は抑えられている。
- OBS オーバーレイは現在表示中の 1 件を描画するため、コメント量が増えても OBS 側の描画負荷は増えにくい。

ただし、「全コメントを 2 時間ぶん保存する」設計ではありません。最大 300 件を超えた古いコメントはメモリから落ちます。配信者がその場で最新コメントを拾う用途なら十分現実的ですが、未表示コメントを後から確実に拾いたい場合は、未表示キューや重要コメント保護が必要です。

## API 使用量への評価

YouTube API quota 枯渇そのものは、現時点で単独 P0 として恐れるよりも、quota を増やす原因を潰すのが先です。

API 使用量が増える主因:

- 配信開始を複数回実行して `videos.list` と stream 接続を重複させる。
- stream が短時間で閉じ続け、再接続を繰り返す。
- parser 不整合や非ネットワーク系エラーを retryable と扱う。
- 別タブや API 直叩きでクライアント側の `busy` を迂回する。
- 手動の同時視聴者数更新を短時間に連打する。

そのため、quota 対策として最初にやるべきなのは Google Cloud Console の増枠申請ではなく、`startBroadcast` の冪等化、再接続上限、エラー分類、手動更新のサーバー側クールダウンです。運用開始後は Cloud Console で実使用量を確認し、必要なら増枠を検討します。

## 推奨対応順

1. 実装済み: `startBroadcast` をサーバー側で冪等化し、開始処理を直列化する。
2. 実装済み: stream 再接続に上限、短時間 close 検知、明確な停止エラーを入れる。
3. 実装済み: YouTube 接続解除時に stream を停止し、broadcast status を整合させる。
4. 実装済み: 認可エラー分類、parser/応答形式エラー、ライブ状態の詳細分類を分けて表示する。
5. 実装済み: 未表示コメント、Super Chat、重要コメントを流しにくいキュー設計にする。
6. 実装済み: 配信前チェックとして refresh token 有無、token 期限、認可エラー案内を整える。
7. 実装済み: Socket 同期と初期ロードの状態競合を整理し、overlay 向け Socket payload を最小化する。
8. 実装済み: 不正 JSON の API エラーを `VALIDATION_ERROR` へ整形する。
9. 実装済み: コメント流入中の Socket payload を差分化し、重複 overlay sync を避ける。
10. 実装済み: 手動視聴者数更新のサーバー側クールダウンと重複除去IDの上限を入れる。
11. 未対応: 依存固定、OAuth `state`、設定入力 UX を後続で改善する。

## 確認済み事項

- `liveChatMessages.list` の定期 polling 実装は見当たらない。
- コメント取得は `liveChat.messages.stream` 方式。
- `/api/youtube/status` は token/env 確認中心で、YouTube Data API の実疎通確認はしていない。ただし refresh token 有無、access token 期限、再接続推奨状態は返す。
- Socket の状態同期や `/api/broadcast/status` は YouTube API を叩いていない。
- コメント一覧はメモリ上で最大 300 件。
- OBS への表示は自動ではなく、管理画面で選択したコメントを表示する仕様。
- `npm test`、`npm run lint`、型チェック、production build は成功確認済み。admin/overlay は in-app browser smoke で確認済み。Playwright E2E はこの環境の Chromium 起動権限で未完了。
