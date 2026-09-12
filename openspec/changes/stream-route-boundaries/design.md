## Context

Next 16 の文書（`node_modules/next/dist/docs`）から、この change に効く事実:

| 事実 | 出典 |
|---|---|
| dynamic な経路は `loading.js` が無いと prefetch されない。あれば「layout から最初の loading 境界まで」を prefetch する | `01-app/02-guides/prefetching.md` 31・62 行 |
| `staleTimes.dynamic` の既定は 0 秒（v15 で 30 → 0）。experimental | `…/staleTimes.md` |
| `loading` 境界は `staleTimes.static`（既定 5 分）の間、再利用される | 同上 Good to know |
| ストリーミング中の `redirect()` は `<meta>` タグで**クライアント側**の遷移になる | `…/functions/redirect.md` 12 行 |
| 共有 layout は遷移のたびに取り直されない。変わる page segment だけ | `staleTimes.md` Good to know |

`server-side-reads` が作る形（design D1・D2）:

```
app/(app)/layout.tsx          下部タブ。<Link>。Server Components
app/(app)/page.tsx            MemoListContainer + TagListContainer
app/(app)/review/page.tsx     DueReviewContainer
app/(app)/record/page.tsx     LearningRecordContainer
app/(app)/memos/[memoId]/page.tsx
```

基準値: `docs/perf.md`（`measure-first-paint`）の「タブ切替」の行。現状のクライアント切替。

## Goals / Non-Goals

**Goals:**

- タブをタップした瞬間に枠と骨格が出る。中身が来るまでの時間が基準値と同等
- 一覧の取得を待たずに HTML の枠が届く
- 失敗と不在に画面がある

**Non-Goals:**

- 静的シェル・Cache Components
- 骨格のアニメーション。まず出す

## Decisions

### D1: `(app)/layout.tsx` は取得しない。認証だけ 1 回行う

layout が `verifySession()` を呼ぶ（未認証なら `/sign-in` へ）。それ以外の取得は持たない。
取得を持つと、layout が最初の loading 境界より前に来て prefetch の範囲が狭まる。

`queries.ts` の `verifySession()` は残す（`server-side-reads` D8: データが出ない側に倒れる）。
二重に見えるが、layout 側は「骨格を見せる前に追い返す」ため、queries 側は「呼び忘れの保険」で、役目が違う。
`cache()` で同じリクエスト内の `auth()` は 1 回になる。

### D2: 経路ごとに `loading.tsx`。中身は Container の骨格

`page.tsx` と同じ形の骨格（一覧なら行の形が 3 つ、復習なら 1 枚のカード）。**骨格の見た目は
モックで 2〜3 案出して選んでもらう**（L11）。配色はいまのトークン。

`loading.tsx` があることで prefetch が効き、タップ時に「layout + 骨格」が即座に出る。
これが D5 の測定の第 1 案。

### D3: Container ごとの `<Suspense>` は、分けてよいものだけ

一覧の経路には `MemoListContainer` と `TagListContainer` がある。別々に来てよいか
（タグの帯が一覧より後に出て構わないか）は、**利用者に聞く**。聞くときはモックで、
「一緒に来る」「帯が先」「一覧が先」の 3 つを見せる。

復習・記録は Container が 1 つなので `loading.tsx` だけで足りる。

### D4: `error.tsx` は `(app)/` に 1 つ。`not-found.tsx` は詳細にだけ

`(app)/error.tsx`: 取得の失敗。文言は `docs/design-decisions.md` のトーン（短く、責めない、
やり直す手段を 1 つ）。`reset()` のボタンを置く。

`(app)/memos/[memoId]/not-found.tsx`: 無いメモと他人のメモ（`navigation` spec「他人のメモの詳細は
開けない」——**他人のものであることを知らせない**ので、無いメモと同じ画面）。Container が
`notFound()` を呼ぶ。`server-side-reads` 3.5 と整合させる。

Route Handler と Server Action のエラーはこの change の範囲外。

### D5: タブ切替は 2 案を測って決める。決めるのは実測

| 案 | 何をするか | 期待 | 副作用 |
|---|---|---|---|
| 1 | `loading.tsx` だけ | タップで即座に骨格、中身は往復後（Workers + D1、数百 ms） | 訪問済みのタブでも毎回骨格が一瞬出る |
| 2 | 1 + `experimental.staleTimes.dynamic: 30` | 30 秒以内に戻ったタブは往復なしで中身が出る | experimental。30 秒間は古い中身が出る（書き込み後は `revalidatePath` / `router.refresh()` で更新されるので実害は限定的） |

**案 1 で「同等」なら案 2 は入れない**（experimental を増やさない）。同等かどうかは
`docs/perf.md` の手順で 5 回ずつ測り、利用者にも staging で触ってもらう。
「同等」の数値の線は `measure-first-paint` の Open Questions で決めたものを使う。

案 2 でも届かなければ、該当タブの中身だけクライアント保持へ戻す退路（`server-side-reads`
Risks）を取る。経路は戻さない。

### D6: 本番投入は `server-side-reads` と同時

`server-side-reads` 単独では、経路が dynamic で `loading.tsx` が無く prefetch されないので、
タブ切替が確実に悪化する。staging で `server-side-reads` を確かめ、この change を重ねてから
`main` へ merge する。**2 つの change を 1 つの PR にしない**——別々に merge し、
2 つ目の merge が本番投入になる。1 つ目の merge から 2 つ目までの間、本番は悪化する。
**間を空けない**（同じ日に続けて merge する）。

## Risks / Trade-offs

- **骨格が一瞬出て消える（フラッシュ）** → 案 2 で消える範囲を測る。消えなければ骨格の出現に
  100 ms 程度の遅延を入れる（CSS の `animation-delay`）。これも測ってから
- **`error.tsx` は Client Component**（Next の制約） → 小さく保つ。取得は持たない
- **`notFound()` を Container の中で呼ぶと、その Container の `<Suspense>` の外へ抜ける** →
  詳細の経路は Container が 1 つなので問題にならない。一覧では呼ばない

## Open Questions

- タブ切替の「同等」の数値（`measure-first-paint` で決める）
- 一覧とタグの帯を別々に流すか（D3、モックで聞く）
