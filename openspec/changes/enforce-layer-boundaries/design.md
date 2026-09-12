## Context

既存の構造検査の形（`lib/query-boundary.test.ts` など）: 対象ファイルを glob で集め、
テキストとして読み、`import` 行を正規表現で見る。AST は使わない。この形で足りている。

到達点の層（`docs/nextjs-rework-plan.md` 2 節）:

```
app/(app)/**             経路と Container
features/<機能>/queries.ts   読み取りの入口（server-only）
features/<機能>/actions.ts   書き込みの入口（"use server"）    ← write-with-server-actions で増える
features/<機能>/components/  表示
features/<機能>/<機能>.ts    ドメイン（純関数）
lib/                     横断
cron-worker/src/         別 worker。ドメインの純関数だけ読む
```

**いまの実装が守れていない規則がある。** `app/api/**` の Route Handler は `lib/db` を直接
import している（書き込みは `write-with-server-actions` まで残る）。検査は**いまの違反を
許容リストに載せて始め**、後続の change が空にする。

## Goals / Non-Goals

**Goals:**

- 向きの違反がコミットできない
- 規則が `CLAUDE.md` と検査で同じ言葉

**Non-Goals:**

- いまの違反を直すこと

## Decisions

### D1: 規則は 5 つ。それぞれ 1 行で言える

| # | 規則 | 守るもの |
|---|---|---|
| 1 | `features/**` は `app/**` を import しない | feature がページを知らない（`server-side-reads` D2） |
| 2 | `app/**` は `lib/db` と `drizzle-orm` を import しない。**例外は許容リスト**（いまは `app/api/**`。`write-with-server-actions` で空にする） | D1 の取り出しは `queries.ts` / `actions.ts` だけ |
| 3 | `"use client"` のファイルは `queries` `server-only` `lib/db` を import しない。**`actions` は対象外**——Server Action は Client Component から import して呼ぶのが正規の使い方（`write-with-server-actions`） | クライアントバンドルにサーバーの読み取り入口が入らない（`next build` でも落ちるが、build は `check` の末尾で遅い。ここで先に出す） |
| 4 | `cron-worker/src/**` は `queries` `actions` `lib/db` `lib/session` を import しない | cron はドメインの純関数だけ読む（`server-side-reads` D7） |
| 5 | `lib/**`（テストを除く）は `features/**` を import しない | `lib/` は横断。feature に依存した瞬間に横断でなくなる |

`.test.ts` は規則 5 の対象外（`lib/*.test.ts` は横断テストで、feature を読んでよい）。
規則 1〜4 はテストも対象。

**規則 3 の「`"use client"` のファイル」は先頭 3 行以内に `"use client"` があるもの。**
コメントの中の文字列で誤検知しないよう、行頭が `"use client"` または `'use client'` の行だけを見る。

### D2: 許容リストは検査ファイルの中に、消す change の名前つきで置く

```ts
/** write-with-server-actions で空にする。増やすときは理由を横に書く */
const ALLOWED_DB_IMPORTS_IN_APP = ["app/api/"];
```

別ファイルにすると、リストだけ増えて検査が空洞化する。検査の隣に置き、diff に出るようにする。

### D3: 違反のメッセージに規則の番号と直し方を出す

```
layer-boundary #2: app/(app)/page.tsx が @/lib/db を import している。
  読み取りは features/<機能>/queries.ts、書き込みは actions.ts を経由すること。
```

チェックリスト「Architecture 違反のエラーメッセージに修正方法または参照先が含まれる」を満たす。

### D4: 5 つの規則それぞれに注入テストを付ける（L06）

`lib/layer-boundary.test.ts` の中で、規則ごとに「違反する 1 行を含む仮のソース文字列」を
検査関数に食わせて赤になることを見る。検査関数はファイルを読む部分と判定する部分を分け、
判定部分を文字列で試せるようにする（`scripts/harness/checks.test.ts` が一時ファイルを
作る方式より軽い）。

## Risks / Trade-offs

- **正規表現で import を見るので、動的 import や再エクスポートは見ない** → 既存の構造検査も
  同じ前提。動的 import が必要になったら、そのときに考える
- **規則 2 の許容リストが「とりあえず足す」で増える** → D2 の「消す change の名前」を必須にする。
  名前の無い項目があれば検査自体が赤（リストの形も検査する）

## Open Questions

- `check:build` を `measure-first-paint` が先に足しているか。足していなければ、この change で
  `check:build`（`next build`）だけ足し、`check:bundle` は向こうに残す
