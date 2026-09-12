## Why

コミット前のレビュー（`scripts/harness/review.sh`）は差分だけを渡している。プロンプトは
「タスクの主張と実装の不一致」を見ろと言うが、**タスクを渡していないので判断できない**。
L08（`- [x]` を付けたがコードもテストも無かった）は、まさにこの不一致であり、レビューが
見つけるべきものだった。

もう 1 つ、進行中の change が **9 件**になった（`docs/nextjs-rework-plan.md`）。
`record-failure.sh` は「archive を除いた change がちょうど 1 件のときだけ change 名を記録する」
ので、いまから失敗はすべて `change: null` で積まれ、`promote-gate` の 3 回のしきい値が
change をまたいで混ざる。**どの change を作業中かを、機械が知る手段が要る。**

## What Changes

- **作業中の change を宣言する仕組み。** `npm run harness:focus -- <change>` が
  `.harness/focus`（gitignore 済み、worktree ごと）に書く。`record-failure.sh` と `review.sh` が
  それを読む。無いときは従来の「1 件だけなら採用」、複数あって宣言も無ければ
  **review は落ちる**（fail closed）
- **レビューに change の文脈を渡す。** 宣言された change の `tasks.md` と `specs/**/spec.md`
  （delta）を差分の前に付ける。プロンプトに「`[x]` のタスクが差分で本当に満たされているか」を足す
- **レビューの所見を残す。** 受領書の `body` は `.harness/` にあり消える。
  `openspec/changes/<change>/reviews.md` に日時・ハッシュ・所見を追記し、change と一緒に archive される

### Non-goals

- レビューのモデルや実行系を変えること
- 指揮（計画）・実装・評価をセッションで分ける運用規則。`CLAUDE.md` に 3 行書くだけで、仕組みは作らない

## Capabilities

なし。`skip_specs: true`。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `scripts/harness/review.sh`, `scripts/harness/record-failure.sh`, `scripts/harness/promote-gate.mjs`（focus を読む）, `package.json`（`harness:focus`）, `CLAUDE.md`, `.gitignore`（`.harness/*` は既に除外。確かめる） |
| 変更（テスト。tasks 1.3 / 2.1〜2.3 が要求している） | `scripts/harness/record-failure.test.ts`, `scripts/harness/promote-gate.test.ts`, `scripts/harness/precommit-gate.test.ts` |
| 変更（tasks 3.2） | `docs/Harness Engineering Checklist.md` |
| 変更（実装中に見つけた欠陥。下記） | `scripts/harness/precommit-gate.sh`, `scripts/spawn-change.sh` |
| 新規 | `scripts/harness/focus.sh`, `scripts/harness/focus.test.ts`, 各 change の `reviews.md`（レビューのたびに生成） |

### 実装中に見つけて直した欠陥（この change の範囲外だが、着手時点で `check:test` が赤かった）

bash 3.2（macOS 既定）は UTF-8 ロケールで `"$hash）"` の `）` の先頭バイトを
変数名の一部として読む。`set -u` の下で unbound variable になり、`precommit-gate.sh` は
**受領書が無いときの案内を出せずに exit 1 で落ちていた**（門としては閉じたままなので
素通りはしないが、「`npm run harness:review` を実行せよ」という指示が届かない）。
`precommit-gate.test.ts` の (a) と (c) が `HEAD` で既に赤かった。
`scripts/spawn-change.sh` にも同じ書き方が 2 か所あり、そちらは `set -e` の下なので
最後の 2 行で落ちる。3 か所とも `${hash}` の形に直した。[L07] の実例（bash の版と
ロケールで変わる）。
