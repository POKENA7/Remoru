## Context

- `review.sh` は `claude -p` に差分だけを渡し、JSON の `findings` が空のときだけ受領書を書く
- `record-failure.sh` は change 名を「1 件だけなら採用、それ以外は空」で決める（28〜36 行）
- `promote-gate.mjs` は `check@change` をキーに数える。`change` が null だと全 change の失敗が 1 つの鍵に集まる
- `.harness/*` は gitignore 済み（`promotions.json` だけ例外）。worktree ごとに別の `.harness/` を持つ
- 進行中の change は 2026-09-12 時点で 9 件

## Decisions

### D1: 作業中の change は `.harness/focus` に 1 行で置く

`npm run harness:focus -- <change>` が、`openspec/changes/<change>/` の存在を確かめてから書く。
存在しない名前は拒む。`npm run harness:focus`（引数なし）は現在の値を表示する。

読む側の順序: `.harness/focus` → 無ければ「archive を除いて 1 件だけ」→ それも駄目なら空。
**review だけは空を許さない**（D3）。`record-failure` は空のまま記録する（失敗の記録を止めない）。

*採らなかった案*: ブランチ名から取る。いまの worktree のブランチは `claude/agitated-…` で
change 名と無関係。命名規則を課すより、宣言 1 行の方が確実。

### D2: レビューに渡すのは `tasks.md` と `specs/**/spec.md`。design は渡さない

差分 + tasks + spec delta。design を足すとプロンプトが数万字になり、レビューが薄まる。
design の判断が要る指摘は、人（またはこの計画）の仕事。

プロンプトに 2 行足す:

```
以下に、この差分が属する change のタスクと spec を添える。
- [x] のタスクのうち、差分に対応する実装かテストが無いものは findings に挙げる。
```

### D3: change が決められないときレビューは落ちる

複数の change があり `.harness/focus` も無ければ、`review.sh` は受領書を作らずに非ゼロで終わり、
`npm run harness:focus -- <name>` を促す 1 行を出す。fail closed（`add-deterministic-harness` D6）。

### D4: 所見は change の中に残す

`openspec/changes/<change>/reviews.md` に追記:

```
## 2026-09-12T03:00:00Z  hash=abc123  findings=0
（body）
```

archive されると一緒に移る。過去のレビューが何を見て何を見逃したかが、あとから読める。
findings があったとき（受領書を作らないとき）も追記する——見つけた指摘こそ残す価値がある。

### D5: 検査（L06）

- `focus.test.ts`: 存在しない change 名を拒む / 書いた値を読める
- `precommit-gate.test.ts` に足す: change が 2 件あり focus が無いとき `review.sh` が非ゼロで
  受領書を作らない（`claude -p` を呼ぶ前に落ちるので、モデル無しで試せる）
- `review.sh` に `--dry-run` を足し、組み立てたプロンプトを標準出力に出して終わる。
  tasks と spec が含まれることをテストで見る

## Risks / Trade-offs

- **`.harness/focus` を書き忘れる** → review が落ちて教える。record-failure は空で記録する
- **プロンプトが長くなり、レビューの質が落ちる** → tasks と spec だけに絞る（D2）。
  数千字の範囲

## Open Questions

なし。
