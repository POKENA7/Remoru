## Why

`server-side-reads` は読み取りを Server Components へ移すが、書き込みは手書きの `fetch` と
Route Handler のまま残し、書き込み後の再取得を `router.refresh()` にする。その design D9 は
「`router.refresh()` は途中の形で、次の change で `revalidatePath()` に置き換わる」と明記
している。これがその change である。

第 9 章「ユーザー操作とデータフェッチ」、第 20 章「データ操作と Server Actions」が対象。
いまの形の不利益は 3 つ:

- 書き込みのたびに**全件を取り直す**（`load()` が 4 本の API を叩く）
- 保存の手応えが**往復の後**に来る。メモを書く動作は成功指標「メモ投入のしやすさ」の中心で、
  往復を待たせるのは目標（一覧が読めるまで 1 秒）と同じ方向の問題
- 書き込みの入口が `app/api/**` に 9 本あり、認証・時計・D1 の取り出しがそれぞれに書かれている。
  読み取り側は `queries.ts` に集約したのに、書き込み側だけが散っている

## What Changes

- **`features/<機能>/actions.ts` を `queries.ts` と対にして置く。** `"use server"` +
  `verifySession()` + ドメイン関数 + `revalidatePath()`。ドメイン関数は触らない
- **メモの保存を楽観的にする。** `useActionState` + `useOptimistic`。押した瞬間に行が現れ、
  刷りの演出（`motion`）がその上で起こる。失敗したら行を消し、本文を入力欄に戻す
- **他の書き込みも Action に移す。** 採点、問答の書き直し、タグの付け外し、削除、本文の編集、
  初回の記録、通知設定と購読
- **`app/api/` を空にする。** cron は D1 を直接読むので影響しない。残すものがあれば理由を 1 行ずつ
- **構造の検査を足す。** `actions.ts` の形（`use server`、`verifySession()`、時計を直に読まない）。
  `enforce-layer-boundaries` の許容リストから `app/api/` を消す

### Non-goals

- 問答の生成の方式。`startGeneration` は Action の中から同じように呼ぶ。`ctx.waitUntil` が
  Action でも取れることを確かめるのは範囲内、取れなかったときの代替設計は範囲外（別 change）
- 生成中のポーリング。`router.refresh()` を一定間隔で呼ぶ形のまま

## Capabilities

### Modified Capabilities

- `memo-capture`: 「投入から一覧への即時反映」を、**保存の完了を待たずに行が現れる**ところまで強める

## Impact

| 対象 | 変更 |
|---|---|
| 新規 | `features/{memo,quiz,review,tag,first-run,notification}/actions.ts`, `lib/action-boundary.test.ts` |
| 削除 | `app/api/**` の Route Handler 9 本（1 本ずつ、対応する Action が E2E と手動で通ってから） |
| 変更 | `features/*/components/**`（`fetch` → Action）, `lib/layer-boundary.test.ts`（許容リストを空に）, `server-side-reads` が残した `router.refresh()` のコメント |
| 前提 | `server-side-reads` と `stream-route-boundaries` が済んでいる |
