## Why

`CLAUDE.md` は置き場と依存の向きを文で決めている。「機能は `features/`、横断は `lib/`」
「feature をまたぐときだけ絶対パス」「`cron-worker` からは相対パス」。検査があるのは
`auth-boundary`（ドメイン層が Clerk を知らない）と `query-boundary`（`queries.ts` の形）
だけで、**層と層の間の向きは何も止めていない**。

これから層が増える。`_containers`（経路側）、`queries.ts` / `actions.ts`（入口）、
`components/`（表示）。`docs/nextjs-rework-plan.md` の到達点の図は、矢印が一方向で
あることに価値がある。図で決めたことは、**図を見なかった次のセッションでは守られない**。
`add-deterministic-harness` の観測——裁量に依存する経路は静かに止まる——がここにも当てはまる。

`docs/Harness Engineering Checklist.md` の Level 2「禁止されている依存関係が CI で FAIL する」
「Public API の境界違反が自動検出される」はどちらも ❌ である。

## What Changes

- **層の向きを構造の検査にする。** `lib/layer-boundary.test.ts`。既存の `query-boundary` と
  同じ形（ファイルを読んで import 文を見る）。規則は 5 つ、いずれも 1 行で言える
- **規則を `CLAUDE.md` の「置き場」の節に表で書く。** 検査と同じ言葉で。散文と検査がずれない
- `server-only` の違反は `next build` でしか出ない。**`check:build` は `measure-first-paint` が
  足す。** この change はそれに依存する（先に merge されていなければ、この change で足す）

### Non-goals

- 循環依存の検出。いまの規模で起きていない。起きたら足す
- Biome の `noRestrictedImports` への置き換え。既存の構造検査と形を揃える方を取る

## Capabilities

### New Capabilities

なし。`skip_specs: true`。

### Modified Capabilities

なし。

## Impact

| 対象 | 変更 |
|---|---|
| 新規 | `lib/layer-boundary.test.ts` |
| 変更 | `CLAUDE.md`（置き場の節に規則の表） |
| 製品コード | 触らない。**いまの実装が規則に違反していれば、この change は違反を直さず、許容リストに載せて後続の change に渡す** |
