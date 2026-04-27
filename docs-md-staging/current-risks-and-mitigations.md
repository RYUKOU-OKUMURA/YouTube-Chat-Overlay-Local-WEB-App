# 現状の課題・懸念点と対策案

作成日: 2026-04-27

このドキュメントは、YouTube Chat Overlay Local WEB App の内部調査で確認した課題・懸念点と、それぞれに対する対策案を整理したものです。実装変更前の検討メモとして扱います。

## 優先度の見方

- P0: 直近で利用不能・quota 枯渇・誤動作に直結するため最優先
- P1: 実運用中に高確率で問題化し得るため早めに対応
- P2: 条件付きで問題化するため改善対象
- P3: 保守性・分かりやすさ・将来リスクの改善対象

## 課題一覧

| 優先度 | 課題・懸念点 | 影響 | 対策案 |
| --- | --- | --- | --- |
| P0 | YouTube API quota 枯渇 | `quotaExceeded` により配信情報取得やコメント取得が止まる。stream 方式でも API quota は消費する。 | Google Cloud Console で quota 使用量を確認する。必要に応じて quota 増枠申請を行う。アプリ側では二重開始・過剰再接続を抑制する。 |
| P0 | stream 再接続が API 使用量を増やす可能性 | `offlineAt` なしで stream が閉じ続けると、`liveChat.messages.stream` 接続が短い間隔で繰り返される。 | 再接続回数の上限、短時間 close 時の長めの backoff、同一原因の連続失敗時の停止を入れる。正常 close と異常 close を分類する。 |
| P0 | 配信開始の多重実行 | 同じ URL で取得中でも `videos.list` が重複し、stream の張り直しや状態上書きが起きる。 | サーバー側で `startBroadcast` を冪等化する。取得中かつ同一 videoId の場合は既存状態を返す。開始処理中はロックまたは in-flight promise を共有する。 |
| P1 | OAuth `refresh_token` が保存されないケース | アクセストークン期限切れ後にコメント取得が失敗する。UI は接続済みに見える可能性がある。 | 既存 token に refresh token がある場合は上書きで消さない。refresh token が無い状態を UI に表示する。再認可手順を明示する。 |
| P1 | OAuth `state` 未検証 | 意図しない Google アカウントの token が保存される可能性がある。 | OAuth 開始時に `state` を生成・保存し、callback で一致検証する。失敗時は token を保存しない。 |
| P1 | YouTube 接続解除後も既存 stream が続く可能性 | UI は未認可なのにコメント取得が継続する状態不整合が起きる。 | disconnect 時に `stopBroadcast()` または stream abort を必ず実行する。接続解除後は broadcast status も stopped/error に更新する。 |
| P1 | YouTube 接続状態が実 API 状態を見ていない | token file があれば `connected` 扱いになり、revoke・期限切れ・scope 不足に開始時まで気づけない。 | 軽量な検証 API を必要時のみ実行する、または開始時の認可エラーを `unauthorized` として明確に表示する。token の期限・refresh token 有無も状態に含める。 |
| P1 | 配信開始リクエストの競合 | 先に押した遅いリクエストが後から現在の stream を abort して状態を上書きする可能性がある。 | `getLiveChatInfo()` 前に開始世代または request id を発行し、古い開始リクエストの結果は破棄する。開始処理を直列化する。 |
| P2 | 認可エラー分類が粗い | `invalid_grant` などが再認可すべきエラーとして表示されず、原因が分かりづらい。 | Google OAuth/API エラーの `reason`、`status`、`error` を追加分類する。`invalid_grant`、401、403 permission 系は再接続案内に寄せる。 |
| P2 | ライブ未開始・終了・チャット無効・権限不足の案内が粗い | `activeLiveChatId was not found` に潰れ、ユーザーが何を直せばよいか分かりづらい。 | `videos.list` の `liveStreamingDetails`、`lifeCycleStatus` 相当の取得方法、YouTube API エラー reason を使って表示文言を分ける。 |
| P2 | 不正 JSON が整形済み API エラーにならない route がある | 空 body や壊れた JSON で 422 ではなく route 例外になる可能性がある。 | `request.json()` を try/catch 内に移動する。JSON parse 失敗を `VALIDATION_ERROR` として返す共通 helper を作る。 |
| P2 | parser エラーが network 扱いで再接続される可能性 | 応答形式不整合が続くと、再接続を繰り返して API 使用量が増える。 | JSON parse/normalize エラーは retryable false に分類する。ネットワーク断と parser 不整合を分ける。 |
| P2 | 初期 REST 読み込みと Socket sync の競合 | 管理画面で OBS 接続中なのに未接続表示、表示中コメントが消えたように見える可能性がある。 | 初期状態取得を Socket `state:sync` に寄せる。REST 結果には受信時刻を持たせ、古い結果で新しい Socket 状態を上書きしない。 |
| P2 | クライアント側の二重開始防止だけでは弱い | React state 反映前の連打、別タブ、API 直叩きで開始リクエストが重複する。 | UI の `busy` は維持しつつ、サーバー側で同一 URL/同一 videoId の開始を抑止する。 |
| P3 | 依存が `latest` 固定 | 将来の install で Next/googleapis/socket.io などの破壊的変更を踏む可能性がある。 | 依存バージョンを固定し、更新は Renovate/手動検証などで段階的に行う。lockfile を基準に CI で再現性を確認する。 |
| P3 | token/settings 破損時の原因表示が弱い | `youtube-token.json` 破損などが未認可扱いになり、突然ログアウトしたように見える。 | 読み取り失敗・JSON parse 失敗・権限エラーをログに出す。UI には「token file が壊れている可能性」などの案内を出す。 |
| P3 | 数値・色設定の入力中に即 PATCH される | 途中値で 422 notice が出たり、不正な色文字列で OBS 表示が崩れる可能性がある。 | 入力中 state と保存済み state を分ける。blur または保存ボタンで PATCH する。色は CSS color として妥当性検証する。 |
| P3 | 低遅延だが完全リアルタイムではない | YouTube 側の送信タイミング、ネットワーク、Socket、React 描画に依存する。OBS 表示は手動選択。 | 仕様として明記する。必要なら自動表示モード、遅延計測、受信時刻・表示時刻の可視化を追加する。 |

## API 使用量に関する整理

現在のコメント取得は `liveChatMessages.list` の定期ポーリングではなく、`liveChat.messages.stream` を使っている。これはポーリングより低遅延・低リクエスト数になりやすい方式であり、基本方針としては妥当。

一方で、以下の条件では API 使用量が増える。

- 配信開始を複数回実行すると、そのたびに `videos.list` が走る。
- stream 接続が短時間で閉じ続けると、そのたびに `liveChat.messages.stream` を張り直す。
- parser 不整合を retryable と見なすと、実装不整合でも再接続が続く。
- 別タブや API 直叩きでは、クライアント側の `busy` だけでは多重開始を防げない。

## 対応順の提案

1. `startBroadcast` のサーバー側冪等化と競合制御
2. stream 再接続ポリシーの見直し
3. disconnect 時の stream 停止連動
4. OAuth refresh token 保持と `state` 検証
5. 認可・ライブ状態・チャット無効などのエラー分類改善
6. 不正 JSON と parser エラーの分類改善
7. 管理画面の初期 REST/Socket 競合改善
8. 依存バージョン固定と運用ドキュメント整備

## 確認済み事項

- `liveChatMessages.list` の定期ポーリング実装は見当たらない。
- `/api/youtube/status` は token/env 確認のみで、YouTube Data API は叩いていない。
- Socket の状態同期や `/api/broadcast/status` は YouTube API を叩いていない。
- コメント取得は stream 方式のため、ポーリングより低遅延な設計になっている。
- OBS への表示は自動ではなく、管理画面で選択したコメントを表示する仕様。
