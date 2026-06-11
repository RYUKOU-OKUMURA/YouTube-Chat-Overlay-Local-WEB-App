# 修正メモ

## 対応状況

1. **修正済み: 配信中に削除されたコメントを「削除済み」表示にする**
   削除コメントは一覧から消さず、本文を「このコメントは削除されました。」または「このコメントは投稿者により取り消されました。」へ置き換える。
   `messageDeletedEvent` / `messageRetractedEvent` の camelCase・snake_case に加え、`tombstone` 形式も削除イベントとして扱う。
   `messageRetractedEvent` で `retractedMessageId` / `retracted_message_id` が省略される場合、`item.id` は元コメント ID ではないため削除対象として使わない。
   削除イベントが先に届いた場合は pending キューに保持し、対象コメント取り込み時に再適用する。
   削除対象が保持中コメントに見つからない場合は、実配信調査用に warning ログを残す。

2. **修正済み: 撤回プレースホルダが別 ID で届くケースを元コメントへ紐づける**
   YouTube Studio の「メッセージが撤回されました」は、API 上では元コメントとは別の `LCC.*` ID を持つプレースホルダ文言として届くことがある。
   プレースホルダ ID を削除対象にせず、`targetAuthorChannelId` とプレースホルダ時刻以前の同一著者の直近コメントから元コメントを解決する。
   ストリームで撤回プレースホルダが届いた場合は一覧へ追加せず、元コメントを `deletionStatus: "retracted"` に更新する。
   元コメントより先に撤回プレースホルダが届いた場合も pending に積み、元コメント取り込み直後に再適用する。
   撤回プレースホルダは list の履歴ウィンドウにのみ現れるため(下記3参照)、60秒間隔の list reconcile から同じ著者・時刻アンカーの解決を通して適用する。

3. **修正済み(方針変更): list reconcile を60秒間隔で復活する**
   一度 quota 節約のため `liveChatMessages.list` 補完を停止したが、**stream は進行中の接続へ撤回を一切配信しない**ことが実配信ログ(`.cursor/debug-83afc2.log`: 撤回検出は全件 list 経由、stream 経由ゼロ)と公式ドキュメント(現行仕様に `messageRetractedEvent` は存在せず、`tombstone` は「削除時には送信されない」と明記)で確定した。
   このため撤回・削除の検知用に `listLiveChatDeletionEvents`(`liveChatMessages.list` 1回/60秒)を復活し、プレースホルダ・tombstone・deletion イベントを抽出して既存の著者アンカー解決へ流し込む(`scheduleDeletionReconcile`)。3時間配信で約180回の list 呼び出しであり、日次 quota 内に収まる。
   適用済みの deletion が60秒ごとの再取得で pending に再キューされないよう、解決済みターゲットが同じ `deletionStatus` を持つ場合は適用済みとして扱う。

4. **修正済み: 絵文字コメントが英数字の文字列でしか表示されない**
   通常コメントは `textMessageDetails.messageText` を優先し、Unicode絵文字を含む本文を保持する。
   Super Chat は `superChatDetails.userComment` を本文候補に含める。
   `displayMessage` は fallback として維持する。

5. **今回は見送り: 独自絵文字の追加**
   YouTube独自絵文字の画像化や shortcode 変換は今回の修正範囲外。
   `ChatMessage` は `messageText: string` のまま維持する。

6. **修正済み: 吹き出しのしっぽ付近でコメントテキストが消える**
   `comic-pop` と Super Chat のしっぽを本文より背面に回し、本文側の下余白を増やした。
   しっぽのダイヤがコメント本文を塗りつぶさないようにした。

7. **整理済み: 調査用デバッグ計装を削除**
   セッション `83afc2` の NDJSON ログ出力と固定パスの `debugSessionLog` は本番コードから削除した。

## 確認済み

- `npm test`: 15 files / 148 tests passed
- `npx tsc --noEmit --ignoreDeprecations 6.0`: passed
- `npm run build`: passed
- `git diff --check`: passed
- Overlay の `comic-pop` と Super Chat 表示を Playwright で確認済み

## 制限事項

- 配信コメント取得開始前に投稿・撤回されたコメントは、YouTube API の履歴窓の都合で管理画面に反映できない場合がある。

## 削除・BAN の仕様（必須修正後）

- **`userBannedEvent`**: YouTube API は BAN イベントの通知のみで、過去ログの一括削除は保証しない。本アプリは OBS オーバーレイ用途のため、**保持中の同一 `authorChannelId` のコメントをすべて「削除されました」表示**にする（`appControllerStream.test.ts` の BAN テストが正とする）。
- **撤回プレースホルダ（著者アンカー）**: 同一著者が 2 秒以内に 2 件投稿した場合でも、**より新しい 1 件**に紐づける。
- **保持 300 件超え**: メッセージ本体は evict されるが、削除レジストリと著者タイムラインで削除状態を追跡する。
- **list reconcile**: 撤回検知のため `liveChatMessages.list` を**60秒間隔で1回**呼ぶ(配信中のみ)。初回全ページ走査や `pollingIntervalMillis` 間隔での高頻度ポーリングは行わない。撤回の表示反映は最大60秒遅延する。
- **空文字メッセージ**: 本文が空のメッセージ(altText なしの Super Sticker 等)は削除プレースホルダとして扱わない(`isYoutubeSystemDeletedMessage("")` は false)。同一著者の直近コメントを誤って「削除されました」にしないため。

## 未確認

- `npm run lint`: 現在の環境では `eslint: command not found` で実行不可
