## Why

層の向きの検査は `tests/architecture/layers.arch.test.ts`（`component-directories`）に**ある**。
見ているのは 2 つ——`features/` `lib/` `hooks/` が `app/` を参照しない、`lib/` が `features/` を
参照しない。`auth.arch.test.ts` が `actions.ts` の形（`"use server"`、`verifySession()`）を見る。

**見ていない向きが 3 つある。**

| 規則 | 守るもの | いま |
|---|---|---|
| `app/**` は `lib/db` と `drizzle-orm` を import しない | D1 の取り出しは `queries.ts` / `actions.ts` だけ | 違反は無い（`app/api` が消えたので）。守る検査も無い |
| `"use client"` のファイルは `queries` `server-only` `lib/db` を import しない | クライアントバンドルにサーバーの読み取り入口が入らない | `next build` で落ちるが、`next build` は `check` に無い。**コミットできて CI で落ちる** |
| `cron-worker/src/**` は `queries` `actions` `lib/db` `lib/session` を import しない | cron はドメインの純関数だけ読む（`server-side-reads` D7） | `server-only` が実行時に throw する。型では出ない。検査も無い |

これから `move-client-boundary-to-leaves` で境界を葉へ下ろし、`stream-route-boundaries` で
`loading.tsx` `error.tsx`（Client Component）が増える。**境界を動かす change の前に、境界の検査を
揃える。**

## What Changes

- **`layers.arch.test.ts` に 3 つの規則を足す。** 既存の形（ファイルを読んで import 指定子を見る）のまま
- **`check:build`（`next build`）を `check` に足す。** `server-only` の違反はビルドでしか出ない。
  手元で 2 秒台。`measure-first-paint` の `check:bundle` がこれに依存する
- 違反のメッセージに規則の番号と直し方を出す
- `CLAUDE.md` の「置き場」に規則の表を、検査と同じ番号・同じ言葉で書く

### Non-goals

- `"use client"` ⇔ `*-client.tsx` の命名規則。`move-client-boundary-to-leaves` が改名と一緒に足す
- 循環依存の検出。起きたら足す

## Capabilities

なし。`skip_specs: true`。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `tests/architecture/layers.arch.test.ts`, `package.json`（`check:build`）, `CLAUDE.md` |
| 製品コード | 触らない。**いまの実装が規則に違反していれば、直さず理由つきの許容リストに載せる** |
