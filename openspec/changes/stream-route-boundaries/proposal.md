## Why

`server-side-reads` は画面を経路に分け、取得を Server Components へ移す。しかし
`loading.tsx` `error.tsx` `<Suspense>` は「置き場を作るだけで置かない」と Non-goal に
している。**置かないままだと 2 つのことが起きる。**

1. **タブ切替が遅くなる。** 経路が dynamic で `loading.js` が無いと、`<Link>` は prefetch
   しない（Next 16 の文書 `prefetching.md`「a dynamic route is skipped unless it has a
   `loading.js` boundary」）。タップのたびにサーバー往復を待ち、その間は前の画面のまま。
   利用者の条件は「タブ切替は現状と同等」（2026-09-12）。**現状は数十 ms** である
2. **初期表示が一覧を待つ。** 枠（下部タブ）は静的なのに、一覧の取得が終わるまで
   HTML が流れてこない。第 28 章「Suspense と Streaming」がそのまま当てはまる

第 32 章「エラーハンドリング」も未適用で、取得が失敗したときの画面が無い。

**`server-side-reads` は staging 止まりにし、本番へはこの change と一緒に出す。**
経路の分割だけを本番に出すと、タブ切替が確実に悪化する。

## What Changes

- **`(app)/layout.tsx` の枠は取得を持たない。** 各経路に `loading.tsx` を置き、
  prefetch が効く形にする。タップで即座に枠と骨格が出る
- **Container ごとに `<Suspense>`。** 一覧とタグの帯、復習の一覧と件数、のように
  独立に来てよいものを分ける。何を分けるかは**モックで見せて**決める（L11）
- **`error.tsx` と `not-found.tsx`。** 取得の失敗と、無い・他人のメモ
- **タブ切替の体感を測って決める。** `loading.tsx` だけで「同等」に届かなければ、
  `experimental.staleTimes.dynamic` で訪問済みのタブを短時間保持する案を測る
- 未認証の遮断は `(app)/layout.tsx` で 1 回行う（ストリーミングの途中で `redirect()` が
  起きると `<meta>` による遷移になり、骨格が一瞬見える）

### Non-goals

- Cache Components（第 3.1 部）と静的シェル。この change の実測で目標に届かないときの次の手
- 書き込み。`write-with-server-actions`

## Capabilities

### Modified Capabilities

- `navigation`: 読み込み中の枠、取得の失敗、無いメモの経路、の振る舞いを足す

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `app/(app)/**`（`loading.tsx` `error.tsx` `not-found.tsx` の追加、Container の `<Suspense>`）, `next.config.ts`（`staleTimes` を採るとき）, `app/globals.css`（骨格の見た目） |
| 前提 | `server-side-reads` の 2〜4 章が済んでいる。`measure-first-paint` の手順と基準値がある |
| 本番投入 | **`server-side-reads` と同時**。単独では出さない |
