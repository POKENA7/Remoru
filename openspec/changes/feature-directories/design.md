## Context

動機は proposal.md の「Why」を参照。ここでは移動の形を決めるのに要る事実だけを置く。

**依存の実測**（`lib/*.ts` の `from "./…"` を機能で分類して数えた）

- feature をまたぐ**実装**の依存は 3 本しかない。すべて行き先が `review` である
  - `first-run` → `review`
  - `quiz` → `review`
  - `record` → `review`
- 残りの 17 本はテストからの依存で、うち 9 本は `test-db` へのもの
- feature 内の依存はすべて相対 import（`./memos`）。`lib/` 内で `@/lib/…` を
  使っている実装は 1 つも無い

つまり**機能の境界はすでに実質できていて、ディレクトリだけが無い**。移動は
既存の依存構造を写し取る作業であって、新しい構造を作る作業ではない。

**外側からの参照**

- `app/` から `@/lib/current-user` が 13 箇所、`@/lib/db` が 12 箇所
- `cron-worker/src/` が `../../lib/` を相対パスで 5 モジュール参照している。
  さらに `cron-worker/tsconfig.json` の `include` にその 5 本がファイル名で
  列挙されている
- ルートの `tsconfig.json` は `cron-worker` を `exclude` している。
  `npm run check` は cron-worker の型を見ていない

## Goals / Non-Goals

**Goals:**

- 実装ファイルの置き場を機能で決め、`openspec/specs/` の capability 名と一致させる
- feature をまたぐ依存が import 文の見た目で分かるようにする
- 移動の前後で `npm run check` の結果が一致することを、この change の完了条件にする

**Non-Goals:**

- 依存の向きを直すこと。`review` に 3 本集まっているのは事実としてそのまま写す。
  整理したくなっても、この change ではやらない
- `features/` の中をさらに `queries.ts` / `components/` に割ること。次の change で
  Container/Presentational を導入するときに、必要になった分だけ割る
- 公開する関数や型を変えること

## Decisions

### D1: `features/` はリポジトリ直下に置く。`app/` や `src/` の下ではない

`cron-worker/` が `notification-*` と `review-scheduler` を読んでいる。cron-worker は
Next.js のアプリではなく独立した Workers スクリプトなので、`app/` の下に置くと
「アプリの一部を worker が覗く」形になる。直下に置けば、Next と cron が同じ層を
共有していることが構造に現れる。

**採らなかった案**: `src/features/`。`app/` `lib/` `db/` `scripts/` が既に直下にあり、
ここだけ `src/` を挟むと 2 つの流儀が混ざる。

### D2: 分類は `openspec/specs/` の capability 名に合わせる

`review-scheduling` と `review-session` は `features/review/` にまとめ、
`quiz-item` と change 側の `quiz-generation` / `quiz-editing` は `features/quiz/` に
まとめる。capability より粗い粒度になるが、**capability 名から辿れること**が目的
であって 1 対 1 対応が目的ではない。1 対 1 にすると `features/review-session/` が
`review.ts` 1 本だけのディレクトリになる。

### D3: feature をまたぐ import だけ絶対パスにする

feature 内は相対（`./memos`）、feature をまたぐときは `@/features/review/review-scheduler`。

こうすると **import 文を見ただけで境界を越えたことが分かる**。全部を絶対パスに
揃えると、境界を越えたかどうかがパスの長さでしか分からない。全部を相対にすると
`../review/review-scheduler` になり、移動のたびに書き換わる。

越える先は実装では `review` の 3 本だけなので、絶対パスの登場は少ない。増えたら
それは境界がずれた合図になる。

### D4: `lib/` に残すのは 4 本だけ

`db.ts`（D1 バインディングの取り出しと `waitUntil`）、`session.ts`、
`test-db.ts` / `test-d1.ts`（テスト補助）。いずれも機能を持たず、全機能から使われる。

`lib/` を空にして `core/` などへ改名する案は採らない。改名は追従の量を増やすだけで、
`lib/` という名前が横断を指すのは十分に通る。

**実装中に追記。** 実装だけでなく、**1 つの feature に属さないテスト**も `lib/` に
残す。`auth-boundary` `cron-boundary` `cascade` `isolation` `test-db.test` の 5 本で、
いずれも複数の feature をまたいで境界を検査している。どれか 1 つの feature に置くと、
検査の意味がその feature に閉じて読めなくなる。

### D5: `current-user.ts` は `session.ts` に改名する

次の change で「認証済みでなければ止める」責務（`verifySession()` 相当）が
このファイルに入る。`current-user` は「いまの利用者は誰か」しか意味せず、
止める役目を持った時点で名前が実態からずれる。**移動でどのみち全参照を触るので、
改名するならいまが最も安い。**

中身は変えない。`getCurrentUserId()` は名前も実装もそのまま、ファイル名だけ変える。

### D6: `cron-worker` の型検査を `check:types` に入れる

この移動は `cron-worker/tsconfig.json` の `include` に書かれたファイル名 5 本を
壊す。しかしルートの `tsconfig.json` は `cron-worker` を除外しているので、
**壊しても `npm run check` は緑のまま通る**。テストは vitest が cron-worker の
`*.test.ts` を拾うので落ちるが、型エラーだけなら誰も気づかない。

`check:types` を `tsc --noEmit && npm --prefix cron-worker run typecheck` にする。
検査の定義が `package.json` の 1 か所にある形は崩さない。

これは検査を増やす変更であり、移動そのものではない。しかし**この移動が開ける穴**
なので、同じ change で塞ぐ。L06 に従い、`cron-worker/src/index.ts` に型エラーを
1 つ注入して赤くなることを確かめてから採用する。

### D7: 移動は `git mv` で行い、1 コミットに import の書き換えまで含める

`git mv` だけのコミットと import 書き換えのコミットに分けると、間のコミットで
ビルドが壊れた状態が履歴に残る。ハーネスの門はコミットのたびに `check` を走らせる
ので、そもそも通らない。1 つの feature ごとに「移動 + 追従」をまとめて 1 コミットに
する。

### D9: vitest に `@/` の解決を教える

`@/` は `tsconfig.json` の `paths` で解決しているが、**vitest はそれを読まない**。
D3 で「feature をまたぐ import は絶対パスにする」と決めた以上、
`vitest.config.ts` に `resolve.alias` を足さないとテストだけが解決に失敗する。
実装中に、最初の feature を移した時点で判明した。

`cron-worker` には `@/` が無い（独自の tsconfig を持ち、wrangler が束ねる）ので、
cron-worker 側からの参照だけは相対パス（`../../features/…`）にする。

### D8: 置き場を直接読むアーキ検査テストは、この change で追従させる

実装中に判明した。`lib/*.test.ts` のうち 8 本が `process.cwd()` から
`lib/<file>.ts` をファイルとして読み、その中身を正規表現で検査している。
移動すると `readFileSync` が投げて落ちる——これは気づける。

問題は 1 本だけ静かに弱くなることである。

```ts
// lib/auth-boundary.test.ts
it("Clerk を知るのは lib/current-user.ts だけ", () => {
  const libFiles = readdirSync(join(ROOT, "lib")).filter(...);
  const importers = libFiles.filter((f) => ...includes("@clerk"));
  expect(importers).toEqual(["current-user.ts"]);
});
```

**走査しているのは `lib/` だけ**である。移動後に `features/` のどれかが Clerk を
import しても、この検査には見えない。落ちないので誰も気づかず、緑のまま何も
守らない検査になる（L06）。

D6 と同じ理屈で、**この移動が開ける穴なので、この移動と同じ change で塞ぐ**。
走査範囲を `lib/` と `features/**` の両方に広げ、L06 に従って `features/` 側に
`@clerk` の import を注入し、赤くなることを確かめてから採用する。

これに伴い、この change では**テスト本文の変更が発生する**。移動の差分は
import 行だけ、という原則（下の Risks 1 つ目）の例外になる。例外はこの 8 本の
path 定数と、`auth-boundary.test.ts` の走査範囲に限る。

対象:
`scheduler-boundary` `tag-review-boundary` `tag-suggestion` `notification-timing`
`learning-record` `cron-boundary` `auth-boundary`（`app/memo-list-boundary.test.ts`
は `app/` を読んでいるだけなので対象外）

## Risks / Trade-offs

- **移動のついでに中身を直したくなる** → `git mv` と import の書き換え以外を
  入れない。差分に `git diff -M` でリネーム検出をかけ、中身が変わったファイルが
  無いことを目視する。中身が変わってよいのは、import 行と
  `cron-worker/tsconfig.json` と `package.json`、および D8 が挙げた
  アーキ検査テストの path 定数と走査範囲だけ

- **`git mv` の途中でビルドが壊れた状態ができる** → feature 単位で移動し、
  各 feature の移動が終わるたびに `npm run check` を通す。7 feature なので 7 回

- **`check:types` に cron-worker を足したことで、CI で新たに落ちる** →
  cron-worker は独自の `package.json` を持ち、CI は既に `npm ci --prefix cron-worker`
  を実行している（`.github/workflows/ci.yml`）。依存は入っている。ただし
  **手元で緑でも CI で落ちる欠陥は過去 4 件出ている**（L07）ので、この change の
  完了は CI が緑になったことを見て判断する

- **次の change で `app/` を解体するとき、`features/` の粒度が合わないと分かる**
  → 合わなかったら次の change で割り直す。この change は置き場の初期値を決める
  ものであって、最終形を決めるものではない

- **`@/features/…` の絶対パスが増えると、境界を越えたことに慣れて麻痺する**
  → いまは実装で 3 本しかない。増えたことに気づけるよう、design のこの節に
  実測値（3 本、行き先はすべて `review`）を残す

## Migration Plan

デプロイ手順は無い。振る舞いが変わらないので、ロールバックは revert で足りる。

移動の順は依存の少ない方から: `notification` → `first-run` → `record` → `tag` →
`quiz` → `memo` → `review`。`review` を最後にするのは、3 本の実装依存の行き先が
すべて `review` だからで、先に動かすと他の feature が未移動のまま参照先を
書き換えることになる。
