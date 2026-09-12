## Why

`server-side-reads`（archive 済み）は画面を経路に分け、取得を Server Components へ移した。
`loading.tsx` `error.tsx` `<Suspense>` は「置き場を作るだけで置かない」と Non-goal にし、
3 つの Container が `try/catch` で空の画面を返す**途中の形**をコメントつきで残している
（「`error.tsx` を置いたら任せる（次の change）」）。これがその change である。

置かないままだと 3 つのことが起きている。

1. **タブの `<Link>` が prefetch されない。** 経路が dynamic で `loading.js` が無いと prefetch は
   走らない（Next 16 の文書 `prefetching.md`「a dynamic route is skipped unless it has a
   `loading.js` boundary」）。`tab-bar.tsx` のコメントは「押した先の読み込みは Next.js が
   先読みする」と書いているが、**先読みは起きていない**。タップのたびにサーバー往復を待ち、
   その間は前の画面のまま。実機では「耐えられる」と判断された（`server-side-reads` Open Questions）が、
   利用者の条件は「現状と同等」で、測った値は無い
2. **初期表示が一覧の取得を待つ。** `(app)/layout.tsx` は `verifySession()` と `getDue()`（タブのバッジ）を
   持ち、page は 6 本の取得を `Promise.all` で待ってから HTML を返す。枠（下部タブ）は静的なのに、
   一覧が揃うまで何も届かない。第 28 章「Suspense と Streaming」がそのまま当てはまる
3. **取得の失敗が空の画面になる。** `MemoListContainer` は失敗を `console.error` して**空の一覧**を返す。
   利用者には「メモが無い」と見える。第 32 章「エラーハンドリング」

## What Changes

- **各経路に `loading.tsx`。** prefetch が効き、タップで即座に枠と骨格が出る
- **Container ごとの `<Suspense>`。** 一覧とタグの帯のように独立に来てよいものを分ける。何を分けるかは
  **モックで見せて**決める（L11）
- **`(app)/error.tsx`。** Container の `try/catch` を消し、失敗を `error.tsx` に任せる（途中の形を終える）
- **`(app)/layout.tsx` から `getDue()` を外す。** バッジは `<Suspense>` の中の小さな Server Component に
  する。layout が取得を持つと、最初の loading 境界より前に来て prefetch の範囲が狭まる
- **タブ切替と初期表示を測って決める。** `loading.tsx` だけで「同等」に届かなければ
  `experimental.staleTimes.dynamic` を測る

### Non-goals

- Cache Components（第 3.1 部）と静的シェル。この change の実測で目標に届かないときの次の手
- `not-found.tsx` の実装。`memos/[memoId]` に**すでにある**。「無いメモと他人のメモは同じ画面」を spec に固定するだけ

## Capabilities

### Modified Capabilities

- `navigation`: 読み込み中の枠と、取得の失敗の振る舞いを足す

## Impact

| 対象 | 変更 |
|---|---|
| 新規 | `app/(app)/loading.tsx` `review/loading.tsx` `record/loading.tsx` `memos/[memoId]/loading.tsx`, `app/(app)/error.tsx` |
| 変更 | `app/(app)/layout.tsx`（`getDue()` を外す）, `app/(app)/_containers/*`（`try/catch` を消す）, `app/(app)/tab-bar.tsx`（バッジ）, `next.config.ts`（`staleTimes` を採るとき）, `app/globals.css`（骨格） |
| 前提 | `measure-first-paint` の手順と基準値。`add-e2e-smoke` |
