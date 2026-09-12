## Why

`server-side-reads` `stream-route-boundaries` `write-with-server-actions` が済むと、取得と
書き込みはサーバー側にある。しかし**表示のコンポーネントは `"use client"` のまま**移されて
いる可能性が高い（`server-side-reads` は「Presentational を `features/*/components/` に置く」と
言うだけで、境界を下ろすとは言っていない）。`app/memo-detail.tsx` は 16 KB の Client Component で、
本文・タグ・問答の**表示**と、編集フォーム・シートの引きずり・自己採点の**操作**が 1 ファイルにある。

第 11〜13 章（バンドル境界、Client Components のユースケース、Composition パターン）が対象。
`server-side-reads` の 4.2 は「`"use client"` が残る理由を確かめる」まで。この change は**減らす**。

`check:bundle` の値がこの change の成果を示す。目標値は `measure-first-paint` 以降の実測で決める。

## What Changes

- **`"use client"` の一覧表を作り、1 ファイルごとに残す理由を書く**（クライアント処理 /
  サードパーティ / RSC Payload 削減 のどれか、または「無い」）
- **理由が「無い」ものから境界を葉へ下ろす。** Composition パターン: サーバー側の親が表示を描き、
  操作だけを小さな Client Component に切り出して `children` や props で受ける
- **`memo-detail` を割る。** 本文・タグ・問答の表示はサーバー、編集フォーム・シート・自己採点はクライアント
- **Client Component のファイル名を `*-client.tsx` に揃える。** 既存の `quiz-generation-client.ts`
  `tag-suggestion-client.ts` に合わせる。`layer-boundary` に「`"use client"` ⇔ `-client.tsx`」の規則を足す
- `bundle-budget.json` を成果分だけ下げる

### Non-goals

- 見た目の変更。分けるだけ
- `sheet` の引きずりや `motion` の演出の作り直し。それらはクライアント処理で、残る理由がある

## Capabilities

なし。振る舞いは変えない。`skip_specs: true`。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `features/*/components/**`（分割と改名）, `app/(app)/**`（Container の合成）, `lib/layer-boundary.test.ts`（規則 6）, `scripts/harness/bundle-budget.json`, `CLAUDE.md`（置き場の表に規則 6） |
| 前提 | `server-side-reads` `stream-route-boundaries` `write-with-server-actions` が済んでいる |
