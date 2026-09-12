## Why

画面の部品（`features/*/components/` の `.tsx` 13 本）にテストが 1 本も無い。`server-side-reads`
の design はこれを Risks に挙げ、「書き換えの最中は spec のシナリオを画面上で辿ること（L05）が
頼り」と書いていた。その change は済んだが、部品のテストは増えていない。しかしブラウザ枠は実クリックが使えず（記憶: browser-real-clicks-unavailable）、
毎回 iPhone の利用者に委ねている。L05 と L10 はどちらも「人がやる」手順で、
**人がやる手順は静かに省略される**（`add-deterministic-harness` の Why と同じ観測）。

これから部品を葉へ割り（`move-client-boundary-to-leaves`）、読み込み中の枠を入れ
（`stream-route-boundaries`）、保存の見え方を変える（`optimistic-memo-save`）。**利用者が
使う 1 本の流れが通ることを、機械が毎回確かめる**必要がある。

Playwright は実際のクリックと打鍵で画面を動かす。L10 の「人が押せる経路で辿る」を
機械で満たす。iOS 固有のもの（スワイプバック、PWA の通知復帰）は引き続き実機に委ねる。

## What Changes

- **Playwright を入れ、スモークを 1 本書く。** サインイン → メモを書く → 一覧に出る →
  詳細を開く → 戻る → 復習タブを開く。`next dev` に対して走る
- **Clerk の Testing Tokens でサインインを機械化する。** テスト用の利用者を Clerk の
  開発インスタンスに作る（利用者が 2026-09-12 に承認）
- **`check:e2e` を足す。ただし `check` には入れない。** CI の別ジョブと、手で走らせる。
  Stop hook の `check:test` にも入れない（`next dev` の起動が要り、桁が変わる）
- **場所を選ぶ規則を design に置く。** role と label で要素を取り、DOM の構造や
  クラス名に依存しない。部品を割っても書き直しにならないため

### Non-goals

- 画面ごとの網羅。1 本だけ。増やすのは、壊れたことを機械が見つけられなかった出来事が起きたとき
- 本番・staging に対して走らせること。`next dev` とローカル D1 だけ
- 問答の生成を通すこと。`ANTHROPIC_API_KEY` は無い前提で、メモは「未作成」のまま進む

## Capabilities

### New Capabilities

なし。検査の追加であり製品の振る舞いは変わらない。`skip_specs: true`。

### Modified Capabilities

なし。

## Impact

| 対象 | 変更 |
|---|---|
| 依存 | `@playwright/test` `@clerk/testing` を devDependency に |
| 新規 | `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/global-setup.ts` |
| 変更 | `package.json`（`check:e2e`）, `.github/workflows/ci.yml`（`e2e` ジョブ）, `.gitignore`（Playwright の生成物）, `biome.json`（`e2e/` を lint 対象に） |
| GitHub | Environment `e2e` に Clerk の test 鍵とテスト利用者の資格情報 |
| Clerk | 開発インスタンスにテスト用の利用者を 1 人 |
