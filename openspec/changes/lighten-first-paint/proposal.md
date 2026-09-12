## Why

サインイン済みの利用者が `/` を開くと、一覧を描く前にこれだけを読む（2026-09-12、本番、gzip）:

| 何 | 量 | 性質 |
|---|---|---|
| 自前 JS | 224 KB | 経路の中身。`server-side-reads` 以降で減る |
| `clerk.browser.js` + `@clerk/ui` | 125 KB | **アプリ画面では `UserButton` 1 つのためだけに読んでいる** |
| Google Fonts の CSS | 87 KB | **描画をブロック**。別オリジン 2 つへの接続も要る |

『Next.jsの考え方』の章には無いが、依頼の「サイトが開かれるまでの速度」に最も直接効くのがここで、
`server-side-reads` と触る場所が重ならない（ルート layout は向こうの D1 で「いまのまま」）。
先に片づけられる。

利用者の判断（2026-09-12）: Clerk の UI 部品は使わなくてよいが、現状相当の見た目は要る。

## What Changes

- **フォントを `next/font/google` で自前配信にする。** 別オリジンと描画ブロックの CSS が消える
- **`ClerkProvider` をサインイン・サインアップの経路だけに絞る。** アプリ画面は `auth()` を
  サーバー側で使うだけで、Provider を要らなくする。`UserButton` は Provider の要る小さな経路
  （`/account`）へ移し、アプリ画面からはリンクで飛ぶ
- **前後を `docs/perf.md` の手順で測り、`bundle-budget.json` を成果分だけ下げる**
- `/sign-in` の TTFB のばらつき（0.07〜0.53 秒）の原因を `wrangler tail` で切り分け、記録する

### Non-goals

- サインイン画面を自前で作ること。Provider を絞れば Clerk の UI はサインイン画面に**残る**ので、
  「現状相当の見た目」は何もせずに満たされる。自前化は、サインイン画面そのものを速くしたく
  なったときの別 change
- 自前 JS の 224 KB を減らすこと。`server-side-reads` 以降の仕事

## Capabilities

なし。見た目と振る舞いは変えない。`skip_specs: true`。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `app/layout.tsx`（フォントと Provider）, `app/globals.css`（`font-family` を変数に）, `app/memo-tab.tsx`（`UserButton` → リンク）, `scripts/harness/bundle-budget.json` |
| 新規 | `app/(auth)/layout.tsx`（Provider）, `app/(auth)/account/page.tsx`（`UserButton` または `UserProfile`）, `docs/perf.md` に前後の行 |
| 依存 | 増えない |
| 前提 | `measure-first-paint` が済んでいること（手順と基準値が要る） |
