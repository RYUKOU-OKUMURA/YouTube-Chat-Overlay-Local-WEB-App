# 現状の課題・懸念点と優先対応

更新日: 2026-04-28

このドキュメントは、現在の実装調査と 2 時間程度の YouTube Live 運用想定をもとに、今本当に対応すべきことを整理したものです。

想定する運用:

- 配信時間は最低 2 時間。
- 平均視聴者数は約 45 人。
- そのうち約 15 人が継続的にコメントする。
- 配信者は管理画面でコメントを拾い、OBS オーバーレイへポップアップ表示しながら会話する。

結論として、現在のコメント取得方式は `liveChatMessages.list` の短間隔 polling ではなく `liveChat.messages.stream` なので、2 時間配信でコメントを受け続ける設計方針としては妥当です。最大の不安は受信量そのものではなく、配信中に起きたときに復旧しづらい「開始処理の競合」「再接続の暴走」「OAuth/接続解除との状態不整合」と、コメント量が増えたときの「未表示コメントを拾いきる操作性」です。

## 優先度の見方

- P0: 配信中の停止、二重取得、quota 消費増、状態破壊に直結するため最優先で直す。
- P1: 2 時間運用でストレスや取りこぼしにつながりやすいため早めに直す。
- P2: 条件付きで問題化する。P0/P1 の後に改善する。
- P3: 保守性、案内、将来リスクの改善。今すぐの配信安定性には直結しにくい。

## 今すぐやるべきこと

| 優先度 | 対応 | なぜ今必要か | 実装方針 |
| --- | --- | --- | --- |
| P0 | `startBroadcast` のサーバー側冪等化と競合制御 | 現状は `getLiveChatInfo()` 後に既存 stream を reset するため、連打・別タブ・遅いリクエストの逆転で stream 張り直しや状態上書きが起きる可能性がある。配信開始時の事故が一番ストレスになる。 | 開始処理を 1 本に直列化する。取得中かつ同一 `videoId` なら既存 `broadcastStatus` を返す。開始中は in-flight promise または lock を共有する。古い開始リクエストの結果は破棄する。 |
| P0 | stream 再接続ポリシーの強化 | stream が短時間で閉じ続けると、`liveChat.messages.stream` を張り直し続ける。API quota 消費増と「接続中/再接続中」の不安定表示につながる。 | 連続再接続回数、短時間 close 回数、累積失敗時間の上限を入れる。上限到達時は停止して明確なエラーを表示する。backoff は 1 秒開始ではなく、短時間 close が続いたら早めに長めへ寄せる。 |
| P0 | YouTube 接続解除時に stream を必ず停止する | 現状の `/api/youtube/disconnect` は token 削除と status 更新だけで、既存 stream を止めない。UI は未認可なのにコメント取得が続く状態不整合が起き得る。 | `disconnectYouTube()` 後に `appController.stopBroadcast()` 相当を呼ぶ。接続解除後の `broadcastStatus` は `stopped` または明示的な `error` にする。 |
| P1 | 未表示コメントを拾いやすくする運用キュー | コメント保持は最大 300 件。2 時間で 300 件を超える可能性は高く、配信者が追いつかないと古い未表示コメントが流れる。視聴者との会話体験に直結する。 | 単なる最新 300 件ではなく、未表示コメント、Super Chat、メンバー/モデレーター/配信者コメントを優先保持する。表示済み/未表示フィルタ、未表示件数、最新追従 ON/OFF の視認性を強める。 |
| P1 | 認可切れ・refresh token 不足の検知と案内 | `/api/youtube/status` は token/env 確認中心なので、token revoke、期限切れ、scope 不足を開始時まで検知しにくい。配信開始直前に失敗すると復旧が面倒。 | 開始時の 401/403/`invalid_grant` を再認可案内へ寄せる。token の `expiryDate` と `refreshToken` 有無を状態に含め、配信前チェックで警告する。 |

## 今すぐの P0 ではないが早めに直したいこと

| 優先度 | 対応 | 影響 | 実装方針 |
| --- | --- | --- | --- |
| P1 | parser/応答形式エラーを network 再接続と分ける | JSON parse や normalize 不整合まで retryable 扱いになると、実装不整合で再接続を繰り返す可能性がある。 | parser 系は terminal error に分類する。ネットワーク断、abort、YouTube terminal error、parser error を別表示にする。 |
| P1 | ライブ未開始・終了・チャット無効の文言改善 | `activeLiveChatId was not found` だけだと、配信者が何を直せばよいか分かりにくい。 | `videos.list` の取得結果と YouTube API reason から、未開始、終了済み、チャット無効、権限不足を分けて表示する。 |
| P2 | 初期 REST 読み込みと Socket sync の競合整理 | 管理画面ロード直後に古い REST 結果が新しい Socket 状態を上書きすると、OBS 接続や表示中コメントが一瞬ずれる可能性がある。 | 初期状態取得を Socket `state:sync` 中心に寄せる。REST 結果には受信時刻を持たせ、古い結果で新しい状態を上書きしない。 |
| P2 | Socket の全体同期を少し絞る | `state:sync` は最大 300 件の messages を全体 emit している。ローカル利用では大問題ではないが、OBS 側には不要な情報が多い。 | admin には全 state、overlay には overlay state と theme 中心に分ける。`comment:new` は admin room のみで維持する。 |
| P2 | 不正 JSON の API エラー整形 | 空 body や壊れた JSON で route 例外になる可能性がある。通常利用では起きにくいが、保守性は落ちる。 | `request.json()` を try/catch 内に寄せ、`VALIDATION_ERROR` を返す共通 helper を作る。 |

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
- `platformMessageId` で重複除去している。
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

そのため、quota 対策として最初にやるべきなのは Google Cloud Console の増枠申請ではなく、`startBroadcast` の冪等化、再接続上限、エラー分類です。運用開始後は Cloud Console で実使用量を確認し、必要なら増枠を検討します。

## 推奨対応順

1. `startBroadcast` をサーバー側で冪等化し、開始処理を直列化する。
2. stream 再接続に上限、短時間 close 検知、明確な停止エラーを入れる。
3. YouTube 接続解除時に stream を停止し、broadcast status を整合させる。
4. parser/認可/ライブ状態のエラー分類を分ける。
5. 未表示コメント、Super Chat、重要コメントを流しにくいキュー設計にする。
6. 配信前チェックとして refresh token 有無、token 期限、認可エラー案内を整える。
7. Socket 同期と初期ロードの状態競合を整理する。
8. 依存固定、OAuth `state`、不正 JSON、設定入力 UX を後続で改善する。

## 確認済み事項

- `liveChatMessages.list` の定期 polling 実装は見当たらない。
- コメント取得は `liveChat.messages.stream` 方式。
- `/api/youtube/status` は token/env 確認中心で、YouTube Data API の実疎通確認はしていない。
- Socket の状態同期や `/api/broadcast/status` は YouTube API を叩いていない。
- コメント一覧はメモリ上で最大 300 件。
- OBS への表示は自動ではなく、管理画面で選択したコメントを表示する仕様。
- `npm test`、型チェック、production build は成功確認済み。`npm run lint` はローカルで `eslint: command not found` となり未確認。
