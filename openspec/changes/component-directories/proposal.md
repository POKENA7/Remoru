## Why

`feature-directories` で `lib/` の 24 モジュールを `features/<機能>/` に整理したが、
**`app/` は手を付けていない**。いま 32 ファイルがフラットに並んでいる
（`.tsx` 11 / 実装 `.ts` 10 / テスト 11）。`lib/` にあったのと同じ煩雑さが残っている。

加えて、整理の途中で `lib/` を**何でも入る箱**として使ってしまった。いま 12 ファイル
中 7 つがテストで、当初案ではそこにさらに 6 つ足そうとしていた。

調べたところ、これは知られた失敗である。[bulletproof-react↗︎](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
は `lib` を「アプリケーション用に**事前設定された再利用可能なライブラリ**」と定義し、
横断のものは `hooks` / `utils` / `types` / `testing` に分ける。
[Feature-Sliced Design↗︎](https://feature-sliced.design/docs/reference/layers) は
`lib` について「helpers や utilities として扱うべきではない」と明記し、各ライブラリは
**1 つの焦点領域**を持つべきとしている。目的不明確な雑多なファイルの置き場に
なることを防ぐためである。

さらに、`*-boundary.test.ts` という名前が **Next.js の用語とぶつかっている**。
Next.js で boundary といえば error boundary（`error.tsx`）と Suspense boundary で、
`server-side-reads` の次の段でどちらも置く予定である。同じ語が 2 つの意味で並ぶ。

これから続く `server-side-reads` のタスク 3 は `app/` の中身を Container /
Presentational に割りながら移していく。**置き場が決まっていないまま割ると、
割った先を毎回その場で決めることになる。** 先に置き場と名前を確定させ、
リネームだけの差分として切り離す（`feature-directories` と同じ理由）。

## What Changes

### 1. `app/` の部品を機能の隣へ

- 画面の部品を `features/<機能>/components/` へ
- 純関数のモジュール（`cells.ts` `detail-selection.ts` など）を `features/<機能>/` へ。
  対応するテストは隣に置いたまま一緒に動かす
- どの機能にも属さない `sheet.tsx` `sheet-drag.ts` は **`features/sheet/` を新設**して置く。
  `openspec/specs/sheet/` が capability として存在し、分類の基準と一致する
- `app/` に残すのは Next.js の規約が置き場を決めるものだけ

### 2. `lib/` を定義どおりに絞る

- `lib/` = **事前設定した外部ライブラリのラッパー**だけ。
  `db.ts`（Drizzle + D1）`session.ts`（Clerk）`request-clock.ts`（React の `cache`）
- `hooks/` を新設し、`session-state.ts` を `use-session-state.ts` として移す
- `tests/` を新設し、どのモジュールにも属さない検査を置く。
  テスト補助（`test-db.ts` `test-d1.ts`）は `tests/helpers/`

### 3. アーキテクチャテストを 1 か所に集め、生態系の語彙で呼ぶ

`*-boundary.test.ts` がやっていることは、世の中で**アーキテクチャテスト**
（フィットネス関数）と呼ばれる確立された実践である。Java の ArchUnit が原型で、
TypeScript には ArchUnitTS / dependency-cruiser / eslint-plugin-boundaries がある。
Next.js の機能ではない。

- 名前を `*.arch.test.ts`、置き場を `tests/architecture/` にする。
  ArchUnit 系の慣習どおり 1 か所に集める
- **`cascade` と `isolation` はこの括りから外す。** どちらもソースを読まず、
  実際に DB を動かして振る舞いを見る普通のテストである。
  `cascade` は `db/` へ、`isolation` は `tests/` 直下へ

`-boundary` という名前をやめるのは、Next.js で boundary といえば error boundary
（`error.tsx`）と Suspense boundary を指し、`server-side-reads` の次の段で
どちらも置くためである。同じ語が 2 つの意味で並ぶ。

### 4. import の制限を linter に移すのは、この change ではやらない

10 本のうち import 制限だけで済むのは 1.5 本で、残りはファイルの中身を見ている。
linter の乗り換えも見送る——oxlint の `no-restricted-imports` は regex パターンで
**side-effect import を拾えず**、`import "server-only"` がまさにそれに当たる。
Biome はパターン指定に未対応。

import グラフの規則が欲しくなったら dependency-cruiser を Biome と**併用**する。
別 change として立てる。

### 5. ついでに見つけた重複を潰す

`MAX_CONTENT_LENGTH = 1000` が `app/types.ts` と `features/memo/memos.ts` の
両方にある。**検証の上限が 2 か所にある。** `app/types.ts` 側を消し、
`features/memo/memos.ts` を参照する。

### Non-goals

- Container / Presentational への分割（`server-side-reads` タスク 3）
- `app-shell.tsx` の解体（同 4.2）
- **振る舞いの変更。** 公開する関数・型・シグネチャ・画面はいずれも変えない

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。振る舞いが一切変わらないため `skip_specs: true`。

## Impact

**移動後の姿**

```
app/          layout.tsx  globals.css  manifest.ts  app-shell.tsx（次の change で消える）
              (app)/…（tab-bar.tsx と 4 つの page.tsx）
              api/  sign-in/  sign-up/
features/     memo  review  quiz  tag  notification  record  first-run  sheet（新設）
                各: ドメイン / queries.ts / 純関数 / components/ / 隣のテスト
lib/          db.ts  session.ts  request-clock.ts
hooks/        use-session-state.ts
tests/        isolation.test.ts
  architecture/ auth / query / cron / navigation / scheduler / sheet /
                unmount / memo-list / target-size  … すべて *.arch.test.ts
  helpers/      test-db.ts  test-d1.ts
db/           schema.ts  types.ts  cascade.test.ts
cron-worker/  src/…
```

**リスク**

- **置き場を直書きしている検査がある。** `target-size` は
  `app/memo-detail.tsx` `app/quiz-sheet.tsx` を、`sheet-boundary` は
  `app/sheet.tsx` などを `readFileSync` で読む。移すと落ちる——落ちるのは
  気づけるので良いが、`feature-directories` の D8 と同じく**置き場を直書き
  しない形に直す**
- 改名で `.learnings` や進行中の change の文中の参照が古くなる。`grep` で洗って追う
  （**archive 済みは書き換えない**——当時の名前で正しい歴史である）
- 移動のついでに中身を直したくなること。`git mv` と import の書き換え以外を
  入れない（例外は D5 で挙げる 2 本と、`MAX_CONTENT_LENGTH` の重複解消）
