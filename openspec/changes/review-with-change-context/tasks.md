## 1. 作業中の change の宣言

- [x] 1.1 `scripts/harness/focus.sh` と `npm run harness:focus` を作る（design D1）。存在しない名前を拒む
      `focus.sh <change>` / 引数なしで表示 / `--resolve`（読む側の入口。決められなければ空を出して 0）。
      `archive` も名前として拒む
- [x] 1.2 `scripts/harness/focus.test.ts` を書く。拒否 / 書き読み の 2 件
      7 件にした（拒否 2・書き読み 1・`--resolve` の 3 分岐・表示 1）。**注入（L06）**: 存在確認を
      `if false` に潰すと 2 件が赤くなることを確認した
- [x] 1.3 `record-failure.sh` と `promote-gate.mjs` が `.harness/focus` を先に読むようにする。
      既存の `record-failure.test.ts` `promote-gate.test.ts` が緑のまま。focus がある場合のケースを 1 件ずつ足す
      `record-failure.sh` は `focus.sh --resolve` を呼ぶ形にした（決定の順序を 1 か所に置く）。
      `promote-gate.mjs` は `--record` で候補が複数の change にまたがるときの絞り込みに使う。
      既存 17 件は緑のまま、focus のケースを 1 件ずつ足して 19 件

## 2. レビューの文脈

- [x] 2.1 `review.sh` が change を決める（design D1・D3）。決められないとき非ゼロで受領書を作らない。
      `precommit-gate.test.ts` に注入ケースを足す（L06）
      **注入**: 「決められなければ先頭を選ぶ」に潰すと D3 のテストが赤くなることを確認した。
      この分岐は `claude -p` を呼ぶ前なので、テストは PATH にモデルを置かずに走る
- [x] 2.2 `review.sh` に `tasks.md` と `specs/**/spec.md` を同梱し、プロンプトに 2 行足す（design D2）。
      `--dry-run` でプロンプトを出し、テストで同梱を確かめる
      **注入**: tasks と spec を添える塊を丸ごと外すと赤くなることを確認した。
      最初に試した「見出しの printf だけを消す」注入では **17 件全部が緑のまま**だった
      （`cat "$tasks_file"` が残っていて本文は入っていた）。検査を通す注入は検査ではない
- [x] 2.3 `reviews.md` への追記（design D4）。findings の有無どちらでも追記されることをテストで見る
      3 件（findings=0 / findings=1 / 2 回目は追記）。**注入**: `append_review` を `return 0` に
      潰すと 3 件とも赤くなることを確認した

- [x] 2.4 （実装中に足した）D4 を入れたら 2 回目以降のコミットが門で止まることが分かった。
      利用者の判断で案A を採り、design に D6 として書いた。`diff-hash.sh` が
      `reviews.md` をハッシュから除き、`review.sh` が追記後に `git add` する。
      テスト 2 件（ハッシュが動かない・門が止めない）。**注入**: 除外を `:/` に潰すと 3 件、
      `git add` を外すと 1 件が赤くなることを確認した。
      ただし `git add` の注入は**最初は 17 件とも緑のまま通った**——fixture の `reviews.md` が
      未追跡で、未追跡ファイルは `git diff --quiet` にも門の部分ステージ検査にも映らないため。
      fixture を「追跡済みの `reviews.md`」に直してから赤くなった

- [x] 2.5 （2 回目のレビューの指摘）`reviews.md` はハッシュだけでなく**レビューに渡す差分からも**外す。
      外さないと、指摘を受けてやり直すたびに前回の所見が差分として積み上がり、
      レビューが自分の出力を読み返す。テスト 1 件。**注入**: 除外を外すと赤くなることを確認した

## 3. 規則

- [x] 3.1 `CLAUDE.md` のハーネスの節に「作業を始めるとき `npm run harness:focus -- <change>`」の 1 行と、
      「計画・実装・評価は別のセッションで行う。計画の成果は `docs/` か change の中に置く」の 3 行を足す
      あわせて「進行中の大きな仕事」の節の「（`review-with-change-context` が済むまでは、その change の
      tasks の先頭に書く）」を消した（済んだので）
- [x] 3.2 `docs/Harness Engineering Checklist.md` の Level 3「Planner の成果が構造化された Artifact として保存される」を
      証拠つきで ✅ にする（`docs/nextjs-rework-plan.md` と 9 件の change）

## 4. 締め

- [x] 4.1 `npm run harness:focus -- review-with-change-context` を打ってから `npm run harness:review` を走らせ、
      `reviews.md` に所見が残ることを見る
      1 回目（07:11:42Z）findings=1、2 回目（07:31:06Z）findings=1。どちらも本物の欠陥で、
      2.4 と 2.5 として直した。この change が捕まえようとした「`[x]` の主張と実装の
      食い違い」（L08）を、初回から自分自身に対して捕まえている。

      **この差分に受領書は現れない。これは欠落ではなく、受領書の作り方の帰結である。**
      受領書は差分のハッシュに紐づくので、「この差分を findings=0 で通した受領書」は、
      この差分を作り終えたあとの実行でしか作れない。その回の `reviews.md` への追記も
      同じ理由で差分には入らない（`reviews.md` は差分から除いてある。D6）。
      作業ツリーの `.harness/reviews/<hash>.json` と、コミットが門を通ったことが証拠になる。
