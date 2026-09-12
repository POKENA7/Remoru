## Context

Next 16 の文書（`node_modules/next/dist/docs`）から、この change に効く事実:

| 事実 | 出典 |
|---|---|
| dynamic な経路は `loading.js` が無いと prefetch されない。あれば「layout から最初の loading 境界まで」を prefetch する | `01-app/02-guides/prefetching.md` 31・62 行 |
| `staleTimes.dynamic` の既定は 0 秒（v15 で 30 → 0）。experimental | `…/staleTimes.md` |
| `loading` 境界は `staleTimes.static`（既定 5 分）の間、再利用される | 同上 Good to know |
| ストリーミング中の `redirect()` は `<meta>` タグで**クライアント側**の遷移になる | `…/functions/redirect.md` 12 行 |
| 共有 layout は遷移のたびに取り直されない。変わる page segment だけ | `staleTimes.md` Good to know |

main の形（2026-09-12）:

```
app/(app)/layout.tsx       verifySession() + getDue()（バッジ）。TabBar / NotificationBridge
app/(app)/page.tsx         MemoListContainer（6 本を Promise.all。失敗は空の一覧）
app/(app)/review/page.tsx  DueReviewContainer（失敗は空）
app/(app)/record/page.tsx  LearningRecordContainer（失敗は空）
app/(app)/memos/[memoId]/  MemoDetailContainer（無ければ notFound()）+ not-found.tsx ✓
```

`loading.tsx` `error.tsx` `<Suspense>` は 0 件。Container 3 つの `try/catch` は「途中の形」と
コメントされている。`server-actions-for-writes` D5 により書き込み後は action の `refresh()` で
RSC Payload が同梱して返る（Router Cache は捨てない）。

基準値: `docs/perf.md`（`measure-first-paint`）の「一覧が読めるまで」「タブ切替」の行。

## Goals / Non-Goals

**Goals:**

- タブをタップした瞬間に枠と骨格が出る。中身が来るまでの時間が基準値と同等
- 一覧の取得を待たずに HTML の枠が届く
- 失敗に画面がある。空の一覧と見分けがつく

**Non-Goals:**

- 静的シェル・Cache Components。骨格のアニメーション

## Decisions

### D1: `(app)/layout.tsx` は認証だけ。`getDue()` は Suspense の中へ

layout の `verifySession()` は残す（骨格を見せる前に追い返す。`auth.arch.test.ts`「画面の枠がサーバー側で
利用者を確認している」が固定している）。`getDue()` は外し、`<TabBar>` のバッジを
`<Suspense fallback={null}><DueBadge /></Suspense>` の小さな Server Component にする。
`TabBar` は `"use client"` なので、バッジは `children` で挟む（Composition）。

layout が取得を持つと「layout から最初の loading 境界まで」の prefetch にその取得が含まれ、
prefetch のたびに D1 を叩く。外せば prefetch は静的な枠だけになる。

### D2: 経路ごとに `loading.tsx`。中身は Container の骨格

`page.tsx` と同じ形の骨格（一覧なら行の形が 3 つ、復習なら 1 枚のカード、記録なら格子）。
**骨格の見た目はモックで 2〜3 案出して選んでもらう**（L11）。配色はいまのトークン。

`loading.tsx` があることで prefetch が効き、タップ時に「layout + 骨格」が即座に出る。これが D5 の第 1 案。

### D3: Container ごとの `<Suspense>` は、分けてよいものだけ

一覧の経路は 6 本の取得を 1 つの `Promise.all` で待つ。一覧（`getMemos` + 状態 + タグ）と
タグの帯（`getTagsWithCounts` + `getSuggestionStatus`）は別々に来てよいか——**利用者に聞く**。
モックで「一緒に来る」「帯が先」「一覧が先」の 3 つを見せる。分けるなら Container を 2 つに割る。

復習・記録は Container が 1 つなので `loading.tsx` だけで足りる。

### D4: `error.tsx` は `(app)/` に 1 つ。Container の `try/catch` は消す

`(app)/error.tsx`（Client Component。Next の制約）: 取得の失敗。文言は `docs/design-decisions.md` の
トーン（短く、責めない、やり直す手段を 1 つ）。`reset()` のボタン。**空の一覧と見分けがつく**ことが
要件（`navigation` spec 追加分）。

3 つの Container の `try/catch` を消す。**「途中の形」のコメントごと消す。** `not-found.tsx` は
すでにあるので触らない。

### D5: タブ切替は 2 案を測って決める

| 案 | 何をするか | 期待 | 副作用 |
|---|---|---|---|
| 1 | `loading.tsx` だけ | タップで即座に骨格、中身は往復後（Workers + D1、数百 ms） | 訪問済みのタブでも毎回骨格が一瞬出る |
| 2 | 1 + `experimental.staleTimes.dynamic: 30` | 30 秒以内に戻ったタブは往復なしで中身が出る | experimental。30 秒間は古い中身が出うる（書き込み後は action の `refresh()` が同梱するので実害は限定的） |

**案 1 で「同等」なら案 2 は入れない**（experimental を増やさない）。`docs/perf.md` の手順で 5 回ずつ測り、
staging で利用者にも触ってもらう。「同等」の線は `measure-first-paint` で決めたもの。

### D6: 初期表示は「枠が先に届く」ことを Performance トレースで示す

一覧の HTML より先に下部タブが描かれる時刻を取る。`docs/perf.md` の「一覧が読めるまで」も 5 回測り、
`measure-first-paint` の基準と比べる。**Streaming は「一覧が読めるまで」を縮めない**（取得の所要は同じ）。
縮むのは「何かが見えるまで」で、それを別の列として記録する。目標の 1 秒に効くのは
`lighten-first-paint` と `move-client-boundary-to-leaves` の側——**この change に 1 秒を期待しない**。

## Risks / Trade-offs

- **骨格が一瞬出て消える（フラッシュ）** → 案 2 で消える範囲を測る。消えなければ骨格の出現を
  100 ms 程度遅らせる（CSS `animation-delay`）。測ってから
- **`error.tsx` は取得の失敗しか受けない** → Server Action の失敗は戻り値（`server-actions-for-writes` D4）。
  ここでは扱わない
- **`getDue()` を layout から外すと、`refresh()` 後のバッジ更新が Suspense の中で起きる** → `refresh()` は
  layout も描き直す（D5 の記述）。バッジも一緒に更新されるはず。E2E で採点後にバッジが減ることを見る

## Open Questions

- タブ切替の「同等」の数値（`measure-first-paint` で決める）
- 一覧とタグの帯を別々に流すか（D3、モックで聞く）
