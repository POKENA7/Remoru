## Why

書き込みは `server-actions-for-writes`（archive 済み）で Server Actions に移った。メモの保存は
`useActionState` の `<form>` で、action が `refresh()` を呼んで一覧を描き直し、返ってきてから
`onSaved()` で刷りの演出が起きる。**行が現れるのは往復の後**である。

`memo-capture` spec は「行は直ちに現れ、演出はその上で起こる」と言う。いまの「直ちに」は
Workers + D1 の往復（数百 ms）を含む。メモを書く動作は成功指標「メモ投入のしやすさ」の中心で、
ここの手応えは初期表示の 1 秒と同じ方向の問題である。

第 9 章「ユーザー操作とデータフェッチ」が挙げる `useOptimistic` がそのまま当てはまる。

## What Changes

- **メモの保存を楽観的にする。** 押した瞬間に一覧の先頭へ仮の行が現れ、刷りの演出がその上で起こる。
  action が返ったら本物の行に置き換わる（演出は繰り返さない）。失敗したら仮の行を消し、本文を
  入力欄に戻す
- **他の書き込みは触らない。** 採点・タグ・削除は往復の後で足りている（1 操作 1 回で、
  結果を待って次に進む性質のもの）

### Non-goals

- 問答の生成の方式、ポーリング
- Server Actions の形（`server-actions-for-writes` D1〜D6 のまま）

## Capabilities

### Modified Capabilities

- `memo-capture`: 「投入から一覧への即時反映」を、**保存の完了を待たずに行が現れる**ところまで強める

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `features/memo/components/memo-tab.tsx` `memo-screen.tsx`（`useOptimistic`）, `features/memo/fresh-memo.ts`（一時 id） |
| 前提 | `stream-route-boundaries` と `move-client-boundary-to-leaves` が済んでいる（保存フォームがどのファイルにあるかが確定してから） |
| 優先度 | **低い。** 初期表示の目標（1 秒）とは独立。B の最後 |
