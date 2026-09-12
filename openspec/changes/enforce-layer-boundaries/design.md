## Context

`tests/architecture/layers.arch.test.ts`（main、2026-09-12）:

- `sources(dir)` が `.ts` `.tsx` を再帰で集め、`specifiers(src)` が import 指定子（静的・side-effect・動的）を拾う
- 規則 1「`features/` `lib/` `hooks/` は `app/` を参照しない」、規則 5「`lib/` は `features/` を参照しない」
- 「走査対象が空でない」の assert がある（L06 の「常に緑」を避ける形）

`auth.arch.test.ts` が `features/*/actions.ts` の `"use server"` と `verifySession()` を見る。
`query.arch.test.ts` が `queries.ts` の `server-only` と `cache()` を見る。**この change は
それらに重ねない。** 向きだけを足す。

層（`CLAUDE.md`「置き場」）:

```
app/(app)/**              経路と Container
features/<機能>/queries.ts   読み取りの入口（server-only）
features/<機能>/actions.ts   書き込みの入口（"use server"）
features/<機能>/components/  表示（いまは全部 "use client"）
features/<機能>/<機能>.ts    ドメイン（純関数）
lib/                      外部ライブラリのラッパーだけ
cron-worker/src/          別 worker。ドメインの純関数だけ読む
```

2026-09-12 の main で規則 2〜4 の違反は **0 件**（`git show` で走査した）。検査は違反が無い状態で
入るので、「いまの違反を許容する」仕組みは要らない。

## Decisions

### D1: 規則は既存の 2 つに 3 つを足して 5 つ。番号を振る

| # | 規則 | 状態 |
|---|---|---|
| 1 | `features/**` `lib/**` `hooks/**` は `app/**` を import しない | 既存 |
| 2 | `app/**` は `@/lib/db` `drizzle-orm` を import しない | **足す** |
| 3 | `"use client"` のファイルは `/queries`（`queries.ts`）`server-only` `@/lib/db` を import しない。**`actions` は対象外**——Server Action は Client Component から import して呼ぶのが正規の使い方 | **足す** |
| 4 | `cron-worker/src/**` は `queries` `actions` `lib/db` `lib/session` を import しない | **足す** |
| 5 | `lib/**` は `features/**` を import しない | 既存 |

**規則 3 の「`"use client"` のファイル」は先頭 3 行以内に行頭 `"use client"` または `'use client'` があるもの。**
コメント中の文字列で誤検知しない。

規則 4 の `cron-worker/src/` は `vitest` の走査対象（`cron-worker/src/*.test.ts` も拾っている）なので、
同じテストファイルから読める。`node_modules` は `sources()` が除外している。

### D2: 違反のメッセージに規則の番号と直し方

```
layers #2: app/(app)/page.tsx が @/lib/db を import している。
  読み取りは features/<機能>/queries.ts、書き込みは actions.ts を経由すること。
```

`expect(offenders).toEqual([])` の `offenders` の各行にこの形で入れる。

### D3: 注入テストは判定関数を文字列で試す

既存の `specifiers()` は文字列を受けるので、規則ごとの判定を `violations(rule, path, src)` の形に
切り出し、「違反する 1 行を含む仮のソース」を渡して非空になることを見る。ファイルを作らない。
規則 1・5 も同じ形に寄せ、5 つとも注入で赤を確かめる（L06）。

### D4: `check:build` は `check` の末尾。`check:bundle` の前

```
check = format → lint → types → test → secrets → build
```

`measure-first-paint` が `check:bundle` を足すときは `build` の後ろに置く。どちらが先に merge されても
成り立つよう、両方の tasks に「相手が未 merge なら `check:build` を自分で足す」を書いてある。

`next build` が `next-env.d.ts` や `.next/` を書き換えても差分にならないことを確かめる（gitignore 済みのはず）。
Linux（CI）で `next build` が通るかは**ここで初めて分かる**（L07）。

## Risks / Trade-offs

- **`next build` が `check` に入り、precommit の門が数秒延びる** → 許容する。2 秒台
- **`next build` が `next/font`（`lighten-first-paint`）で Google に接続する** → CI から接続できなければ
  向こうが `next/font/local` に切り替える。この change の問題ではない

## Open Questions

- ~~`check:build` を `measure-first-paint` が先に足しているか。足していれば D4 は「確かめるだけ」~~
  → **足していなかった**（2026-09-12、`origin/main` = `d7d12b0`）。この change が
  `"check:build": "next build"` を足し、`check` の末尾に並べた。`measure-first-paint` が
  `check:bundle` を足すときは、その後ろに置く

- ~~**`scripts/harness/precommit-gate.sh:86` を直してよいか。**~~ → **このブランチで直した**（利用者の判断、2026-09-12）。
  同行の `（$hash）` が macOS の bash 3.2 + UTF-8 ロケールで `hash\xef: unbound variable` になり、
  門が exit 127 で終わる。PreToolUse は 2 以外をブロックとして扱わないので、
  **「受領書が無い」経路が fail open している**。`precommit-gate.test.ts` の (a)(c) もこれで赤い。
  `${hash}` にすれば直ることは確認済み。CI（`C.UTF-8`）では再現しないので、Linux だけを見ていると見えない（L07）。
  Impact 表の外だが、直さないと `npm run check` も門も通らず 5 セッション全部が止まるため含めた。
  `scripts/spawn-change.sh` の同型 4 か所は残してある。詳細は tasks の 5 節
