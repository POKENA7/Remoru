---
name: delegate
description: Remoru の実装を OpenCode Go のモデルに任せ、Claude が監督・検証・コミットする手順。change の実装を頼まれたら、コードを自分で書く前に使う。
---

# 実装を OpenCode に任せる手順

引数（あれば）は、実装する OpenSpec の変更名（`openspec/changes/<変更名>/`）。

実装担当は change のフォルダと、渡した notes しか見ない。会話で決めた前提・使う
ライブラリ・触るファイルは notes に書く。計画（change の成果物）は監督役が持ち、
実装は別のセッションに任せる（CLAUDE.md「計画・実装・評価は別のセッションで行う」）。

## 1. 準備する（監督役）

- 作業する change の worktree へ移り、`git status` がきれいか確かめる。前の作業が
  残っていると、レビューの差分に混ざる
- `npm run harness:focus -- <change>` で作業中の change を宣言する。宣言しないと
  レビューがどの change の tasks と spec を添えるか決められず、受領書を作らずに落ちる

## 2. notes を書く（監督役）

`.delegate/notes/<change>-implN.md`（N は 1 から）に、その回にやるタスクの範囲と
注意点を書く。1 回の範囲は、確かめられる大きさにする。

- tasks.md のどの番号をやるかを名指しする
- 「どこが」「なぜ問題か」「どうなればよいか」を書く。直し方の細部までは指定しない
- `.delegate/` は gitignore 済みなので、notes はコミットに混ざらない

## 3. 実装させる

```bash
scripts/delegate.sh impl <change> .delegate/notes/<change>-implN.md
```

`run_in_background: true` で流し、完了通知を待つ。待つ間に様子を見に行かない。
実装担当は `openspec-apply-change` の手順で notes の範囲を進め、終えたタスクだけに
チェックを付ける（L08。検証条件を満たしたときだけ完了にする）。
別モデルを使うときは第 4 引数に `opencode-go/<model>` を渡す（`opencode models` で一覧が出る）。

## 4. 監督役が中身を確かめる

- 要約の「最後の報告」と「できなかったこと」を読む
- `git diff --stat` で、notes の範囲外（proposal / specs / design や、無関係な tasks）を
  触っていないか見る。範囲外があれば修正を頼む
- `- [x]` と実装が一致しているか確かめる（L08）。tasks.md の検証条件を diff と照合する
- `npm run check` 相当を監督役が自分で流す
- 画面に関わるものは、spec の Scenario を人が押せる経路で辿る（L05・L10）

## 5. レビューさせる

```bash
HARNESS_REVIEW_RUNNER=opencode npm run harness:review
```

これが受領書を作る唯一の経路である。指摘はそのまま受け入れず、監督役がコードを見て
正しいか判断する。誤った指摘は捨て、正しいものだけを次の修正に回す。
レビュー後に差分を変えると受領書は無効になる。

## 6. 修正させる（必要なときだけ）

`.delegate/notes/<change>-fixK.md`（K は 1, 2, 3）に、直してほしいことを書く。

```bash
scripts/delegate.sh fix <change> .delegate/notes/<change>-fixK.md
```

直前の impl セッションの続きで動くので、実装担当は経緯を覚えている。
修正が 3 回を超えたら、それ以上回さず利用者に相談する。
修正が大きかったときは 5 に戻る。仕様そのものを直す必要が出たら、
`openspec-update-change` で change の成果物を直してから修正を頼む。

## 7. 検証してコミットする（監督役）

- 受領書（`.harness/reviews/<差分のハッシュ>.json`）があり、`findings` が空であることを確かめる
- `git status` を見て、notes に書いていないファイルが混ざっていないか確かめる
- add とコミットを別々の呼び出しで行う（CLAUDE.md）。1 コマンドに書くと、門が判定する
  時点でまだ add されておらず、部分ステージとして必ず落ちる
- コミットのメッセージに、実装したモデル（`DELEGATE_IMPL_MODEL`）とレビューしたモデル
  （`HARNESS_REVIEW_MODEL`）を書く。どちらで通ったかは受領書と `reviews.md` に
  `runner=` `model=` として残っている

実装担当はコミットできない。`opencode.json` が git の書き込み、`openspec archive`、
`harness:review` / `harness:promote`、`wrangler` を権限として拒む。

## 8. 利用者に報告する

何ができたか、どう確かめたか、残った課題を日本語で短く伝える。
最後に、次のセッションに貼る引き継ぎのプロンプトをコードブロックで添える
（CLAUDE.md の「ユーザーとのやり取り」）。
