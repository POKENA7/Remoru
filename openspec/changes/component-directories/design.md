## Context

動機は proposal.md の「Why」を参照。ここでは置き場を決めるのに要る事実だけを置く。

**いまの `app/`**（32 ファイル）: `.tsx` 11（うち Next.js の規約が置き場を決めるのは
`layout.tsx` と `(app)/**` の 6 つ）、実装 `.ts` 10、テスト 11。

**参照の実測**

- 部品の参照元はどれも 1〜2 か所。`app-shell.tsx` だけが 5
- `features/` から `app/` を参照しているファイルは 1 つも無い。
  依存は一方向（`app/` → `features/` → `lib/`）で、移動しても向きは変わらない

**検査が読んでいるもの**（1 本ずつ実測した。proposal の表を参照）

`cascade` と `isolation` は**ソースを読んでいない**。実際に DB を動かして
振る舞いを見る普通のテストで、他の 9 本とは性格が違う（D4）。
残り 9 本のうち、`process.cwd()` からの絶対パスでソースを読むものが 8 本。
このうち 2 本は `app/*.tsx` を名指ししており、この change で動く（D5）。

## Goals / Non-Goals

**Goals:**

- `app/` に残るのを「Next.js の規約が置き場を決めるもの」だけにする
- `lib/` を、外部ライブラリのラッパーという定義に戻す
- アーキテクチャテストを 1 か所に集め、生態系の語彙で呼ぶ
- 名前が Next.js の用語とぶつからないようにする
- 移動の前後で `npm run check` の結果が一致することを完了条件にする

**Non-Goals:**

- Container / Presentational への分割（`server-side-reads` タスク 3）
- `app-shell.tsx` の解体（同 4.2）
- 検査の中身を強くすること。**D5 の 2 本を除いて assert は変えない**

## Decisions

### D1: 部品は `features/<機能>/components/`、純関数は `features/<機能>/` 直下

```
features/memo/
  memos.ts             ドメイン（データベースを触る）
  queries.ts           読み取りの入口
  types.ts             MemoRow など
  detail-selection.ts  純関数
  fresh-memo.ts        純関数
  components/
    memo-tab.tsx
    memo-detail.tsx
    memo-list-rules.test.ts
```

`components/` を挟むのは部品だけにする。純関数まで下げると、`features/memo/` を
開いたときに「この機能は何を持っているか」が 1 階層下に隠れる。

`server-side-reads` の D2 が「Presentational は `features/<機能>/components/`」と
決めており、同じ場所になる。この change はその置き場を**先に用意する**もので、
Container/Presentational への分割はしない。

### D2: `sheet` は機能として立てる

`sheet.tsx` と `sheet-drag.ts` は、メモの詳細・問答・通知設定のどれからも使われる
共通の器である。どれか 1 つに置くと、他の 2 つがそこを覗くことになる。

`openspec/specs/sheet/` が capability として存在しているので、分類の基準
（`feature-directories` D2: capability 名に合わせる）にそのまま乗る。

**採らなかった案**: `app/_components/`。Next.js の慣習としては自然だが、
`app/` を「経路とその枠だけ」にする方針と食い違い、spec からも辿れない。

### D3: `lib/` は外部ライブラリのラッパーだけ。横断のものは種類で分ける

`lib/` に入れてよいのは **1 つの外部ライブラリを、このアプリ用に事前設定して
包んだもの**に限る。

```
lib/db.ts             Drizzle + D1 バインディング + waitUntil
lib/session.ts        Clerk
lib/request-clock.ts  React の cache（リクエストに 1 つの「いま」）
```

`request-clock.ts` を残すのは、React の `cache` を包んだ**1 焦点のライブラリ**
だからで、FSD の基準（各ライブラリは 1 つの焦点領域を持つ）を満たす。

`session-state.ts` は React のフックなので `hooks/` へ移し、
`use-session-state.ts` に改名する（bulletproof-react の `hooks` = アプリ全体で
使う共有フック）。**ファイル 1 本のためにディレクトリを作る**ことになるが、
`lib/` の定義を曖昧にするより良い。曖昧にした結果がいまの状態である。

テスト補助（`test-db.ts` `test-d1.ts`）は `tests/helpers/` へ。
`cron-worker/tsconfig.json` が `../lib/test-d1.ts` を include しているので追従が要る。

### D4: アーキテクチャテストは `tests/architecture/` に集め、`*.arch.test.ts` と呼ぶ

**当初は「守っている場所の隣に置く」と決めていたが、撤回した。**

これらがやっていることは、世の中では**アーキテクチャテスト**（または
フィットネス関数）と呼ばれる確立された実践である。Java の ArchUnit が原型で、
TypeScript には [ArchUnitTS↗︎](https://github.com/LukasNiessen/ArchUnitTS)、
[dependency-cruiser↗︎](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)、
[eslint-plugin-boundaries↗︎](https://github.com/javierbrea/eslint-plugin-boundaries) がある。
Next.js の機能ではない。

語彙を生態系に合わせる。`*.arch.test.ts`、置き場は `tests/architecture/`。
ArchUnit 系の慣習どおり**1 か所に集める**——散らすと「この repo にどんな規則が
あるか」を一覧できなくなる。守っている対象は各ファイルの冒頭に書いてある。

*採らなかった案*: `*-rules.test.ts`。一度これに決めたが、"rules" は
この分野で使われない語で、しかも `eslint-plugin-boundaries` は import 制限に
まさに **boundaries** を当てている。Next.js との衝突を避ける動機は正しかったが、
行き先が生態系から離れる方向だった。

**アーキテクチャテストでないものは、この括りから外す。**

| | 何をしているか | 置き場 |
|---|---|---|
| `cascade.test.ts` | 実際に DB を動かし、連鎖削除の振る舞いを見る | `db/` |
| `isolation.test.ts` | 実際に DB を動かし、利用者ごとの分離を見る | `tests/` 直下 |

どちらもソースを読まず、実データで振る舞いを確かめる普通のテストである。
`tests/architecture/` に混ぜると、この括りが何を意味するのか曖昧になる。

移動先と新しい名前:

```
lib/auth-boundary.test.ts        -> tests/architecture/auth.arch.test.ts
lib/query-boundary.test.ts       -> tests/architecture/query.arch.test.ts
lib/cron-boundary.test.ts        -> tests/architecture/cron.arch.test.ts
lib/navigation-boundary.test.ts  -> tests/architecture/navigation.arch.test.ts
features/review/scheduler-boundary.test.ts
                                 -> tests/architecture/scheduler.arch.test.ts
app/sheet-boundary.test.ts       -> tests/architecture/sheet.arch.test.ts
app/unmount-boundary.test.ts     -> tests/architecture/unmount.arch.test.ts
app/memo-list-boundary.test.ts   -> tests/architecture/memo-list.arch.test.ts
app/target-size.test.ts          -> tests/architecture/target-size.arch.test.ts
lib/cascade.test.ts              -> db/cascade.test.ts
lib/isolation.test.ts            -> tests/isolation.test.ts
```

**実装中に 1 本漏れが見つかった。** `features/review/tag-review-boundary.test.ts` が
上の一覧に無かった。中身は「タグは復習に影響しない」を実データで確かめる
振る舞いのテストで、ソースを読むのは 1 か所だけ。`isolation` と同じ性格なので
`tests/architecture/` には移さず、`features/review/tag-review.test.ts` に改名する
だけにする——`-boundary` を消すのは Next.js との衝突を避けるためで、それは
名前を変えれば足りる。

**これらは `process.cwd()` からの絶対パスでソースを読む**ので、テスト自身が
移動しても読む先は壊れない。壊れるのは**読まれる側**（`app/*.tsx`）が動く分だけで、
それは D5 で扱う。

### D5: 置き場を直書きしている 2 本は、内容で選ぶ形に直す

`target-size` は `app/memo-detail.tsx` `app/quiz-sheet.tsx` を、`sheet` は
`app/sheet.tsx` などを名指しで読む。この change でどれも動く。

**パスを書き換えるだけにしない。** `feature-directories` の D8 で、`lib/` を
固定で走査する検査が移動後に「落ちも警告もせず、ただ何も見なくなる」状態を
作りかけた。対象を名前でなく**内容で選ぶ**形に直し、走査対象が 0 件なら落ちる
検査を併せて置く。

**この 2 本だけが、中身を変えてよい例外である**（`MAX_CONTENT_LENGTH` の
重複解消を除く）。

### D6: `app/types.ts` を機能ごとに割り、重複を潰す

`MemoRow` `ReviewState` `TagRef` `formatDay` は `features/memo/types.ts` へ、
`DueItem` は `features/review/types.ts` へ。`MemoRow` は memo + review + tag の
合成だが、**使うのはメモの一覧と詳細**なので memo に置く。

`MAX_CONTENT_LENGTH = 1000` は `features/memo/memos.ts` にも同じ値がある。
**検証の上限が 2 か所にあるのは欠陥**なので、`types.ts` 側を消して
`memos.ts` から import する。これは移動ではなく修正だが、放置すると
「移動しただけ」の差分に紛れて残る。

`server-side-reads` のタスク 3 で Container を分けると `MemoRow` の形は
見直す可能性がある。この change では動かすだけにする。

### D8: 層の向きを検査で固定する

**レビューの指摘で足した。** 部品を `app/` から `features/` へ移したとき、
`tag-suggestion-band.tsx` が型を `@/app/app-shell` から取り続けていた。
`app-shell.tsx` はその部品を import しているので、**循環参照ができていた**。

design の前提（「`features/` から `app/` を参照しているファイルは 1 つも無い。
依存は一方向」）を、この change 自身が破っていたことになる。文で書いた前提は
守られない。`tests/architecture/layers.arch.test.ts` を足し、
`features/` `lib/` `hooks/` が `app/` を参照しないこと、`lib/` が `features/` を
参照しないことを見る。

型は持ち主の側へ移した（`SuggestionResult` → `features/tag/types.ts`）。
提案は `features/tag/` のものなので、型もそこにあるのが自然である。

### D7: import の制限を linter に移すのは、この change ではやらない

調べた結果、**10 本のうち import 制限だけで済むのは 1.5 本**だった
（`scheduler` が全部、`auth` が半分）。残りはファイルの中身を見ている——
`cache()` で包まれているか、CSS の値、`useState` の有無。import linter の
守備範囲外である。

linter の乗り換えも見送る。oxlint は `no-restricted-imports` を v0.15.0 から
持っているが、**regex パターンで side-effect import が一致しない**という
未解決の不具合がある（[oxc #19956↗︎](https://github.com/oxc-project/oxc/issues/19956)）。
`import "server-only";` はまさに side-effect import で、いちばん検査したい
ものが拾えない。Biome は現状パターン指定に未対応
（[議論中↗︎](https://github.com/biomejs/biome/discussions/6245)）。

import グラフの規則が欲しくなったら **dependency-cruiser を Biome と併用**する
（linter を置き換えず追加するだけで済む）。**別 change として立てる**——
効くのは 1.5 本ぶんで、置き場の整理に混ぜると目的が 2 つになる。

## Risks / Trade-offs

- **移動のついでに中身を直したくなる** → `git mv` と import の書き換え以外を
  入れない。`git diff -M` でリネーム検出をかけ、中身が変わったファイルが
  import 行と D5 の 2 本と `MAX_CONTENT_LENGTH` だけであることを目視する

- **改名すると文中の参照が古くなる** → `.learnings/active.md`・archive 済みの
  design・`CLAUDE.md` に `*-boundary` の言及がある。`grep` で洗って追う。
  **archive 済みの change は歴史なので書き換えない**（当時の名前で正しい）

- **`hooks/` がファイル 1 本のディレクトリになる** → それでよい。
  `server-side-reads` のタスク 3 でフックは増える見込み

- **`server-side-reads` が進行中で `app/` は近く形が変わる** → だからこそ先に
  置き場を決める。変わるのは `app/(app)/**` と `app-shell.tsx` で、この change が
  動かすのはそれ以外である。衝突しない

- **`tests/architecture/` と `scripts/harness/*.test.ts` の違いが分かりにくい** →
  `scripts/harness/` は**検査そのものを検査する**もの（門・hook・`check:*` が
  壊れた入力で赤くなるか）。`tests/architecture/` はアプリの設計規則を検査する。
  この違いを `CLAUDE.md` に 2 行で書く

## 実測: feature をまたぐ実装の import

`feature-directories` の時点で 3 本（すべて `features/review/review-scheduler` 宛）。
部品を移したことで **10 本**になった。増えた 7 本の内訳:

| どこから | どこへ | 理由 |
|---|---|---|
| `quiz/components/quiz-sheet` | `sheet/sheet` | 共通の器を使う |
| `memo/components/memo-detail` | `sheet/sheet` | 同上 |
| `memo/components/memo-detail` | `quiz/components/quiz-sheet` | 詳細から問答のシートを開く |
| `memo/components/memo-detail` | `tag/tag-text` `tag/tag-picker` | 詳細でタグを付け外しする |
| `first-run/first-run-view` | `memo/types` | 告知の判定にメモの一覧を見る |
| `first-run/components/first-run-notice` | `notification/push-subscribe` | 告知から通知を許可する |

**どれも画面が複数の機能を並べることによるもの**で、ドメイン層の依存は
`review-scheduler` 宛の 3 本のまま増えていない。境界がずれた合図ではない。

## Migration Plan

デプロイ手順は無い。振る舞いが変わらないので revert で戻せる。

移動の順は参照の少ないものから: `sheet`（新設）→ `first-run` → `record` →
`notification` → `tag` → `quiz` → `review` → `memo` → 型の分割 → `lib/` の整理と
`hooks/` `tests/` の新設 → アーキテクチャテストの集約と改名。
各段で `npm run check` を通す。

**集約と改名を最後に置く**のは、移動中に落ちた検査を元の名前で追えるように
するため。先に改名すると、落ちた検査がどれだったか履歴から辿りにくくなる。
