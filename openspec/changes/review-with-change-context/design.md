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

### D6: `reviews.md` はハッシュから除き、レビューが自分で `git add` する

D4 を入れたら、2 回目以降のコミットが門で止まった（Open Questions Q1 に経緯）。
利用者の判断（2026-09-12）で案A を採る。

- `diff-hash.sh` が `:(exclude)openspec/changes/*/reviews.md` を付ける。門とレビューの
  両方がこの script を通すので、除外は 1 か所で揃う
- `review.sh` は追記のあと `git add -- <reviews.md>` まで行う
- `review.sh` が**モデルに渡す差分も**同じ pathspec で除く。外さないと、指摘を受けて
  やり直すたびに前回の所見が差分として積み上がり、レビューが自分の出力を読み返す
  （2 回目のレビューがこれを指摘した）

これで、受領書は「レビューが見たコードの差分」に紐づいたままになり、レビュー自身の
書き込みは部分ステージにも、受領書の無効化にもならない。

*代償*: `reviews.md` を書き換えても受領書は無効にならない。手で書き換えて所見を
消せてしまう。ただし所見は**残す**ためのもので、消しても門は開かない（受領書の
`findings` が真を握っている）ので、守る値打ちのある性質ではないと判断した。

## Risks / Trade-offs

- **`.harness/focus` を書き忘れる** → review が落ちて教える。record-failure は空で記録する
- **プロンプトが長くなり、レビューの質が落ちる** → tasks と spec だけに絞る（D2）。
  数千字の範囲

## Open Questions

### Q1: D4（`reviews.md` への追記）は、2 回目以降のコミットを**門が塞ぐ**

実装して走らせたら詰まった。順序はこうなる。

1. `git add -A` でコードと（前回の）`reviews.md` を index に載せる
2. `npm run harness:review` が `reviews.md` に追記する
3. `reviews.md` が index と食い違う ＝ **部分ステージ**。`precommit-gate.sh` が exit 2

実測（`/tmp` の使い捨てリポジトリ、2026-09-12）: 追跡済みの `reviews.md` を追記だけ
した状態で門を呼ぶと「部分ステージのままコミットしようとしている」で 2 が返る。
**初回だけは通る**（`reviews.md` が未追跡で、`git diff --quiet` は未追跡を見ないため）。
つまり最初の 1 回は緑で、次から全セッションが詰まる。

D5/D6 の部分ステージ検査は「検査が一度も見ていない木をコミットさせない」ためのもので、
緩めたくない。一方 D4 の「所見を change の中に残す」も捨てたくない。

**案A（推奨）**: `review.sh` が追記のあと `git add <reviews.md>` まで行い、
`diff-hash.sh` がハッシュの計算から `openspec/changes/*/reviews.md` を除く
（`git diff --cached -- ':(exclude)openspec/changes/*/reviews.md'`）。
受領書は「レビューが見た差分」に紐づいたままで、部分ステージにもならない。
代償は、`diff-hash.sh`（門と共有。壊すと全セッションがコミットできない）に手を入れること。
除外が効いていることと、除外を外すと赤くなることを注入テストで固める。

**案B**: `reviews.md` を `.gitignore` に入れる。D4 の「archive と一緒に移る」を捨てる。
**案C**: D4 を取り下げ、所見は `.harness/` の受領書だけに残す（＝コミットで消える）。
**案D**: 追記を `review.sh` から外し、人が任意に走らせる別コマンドにする。

**回答（2026-09-12、利用者）**: 案A。D6 に書いた。

### Q2: 応答の `body` が、プロンプトの見本の文字列をそのまま返してきた

初回のレビューで `body` が `"全体の所見を数行で"`（プロンプトの JSON 見本の値そのもの）
だった。D4 で残す所見が見本の写しでは、残す意味が無い。見本の値を
`"<全体の所見を数行で。この文言をそのまま返さない>"` に変えた。Decisions は変えていない。
