
## 2026-09-12T07:11:42Z  hash=94773c21dea24df8af0a80771cc09ecffd6411d397010ba23daf4d4a41a276fd  findings=1

全体の所見を数行で

- openspec/changes/review-with-change-context/tasks.md:40 タスク4.1は[x]だが、review.shを実行した痕跡(reviews.md・.harness/reviews/*.json)が存在しない

## 2026-09-12T07:31:06Z  hash=dcada646971a71fa3c94f5e7f1bdfe2f0bf21d5bd10841fd5aae19a964e5a0bf  findings=1

D6 でハッシュ計算からは reviews.md を除外したが、review.sh がモデルに渡す `$diff` の抽出はその除外を再利用しておらず、レビューリトライ時に前回の所見テキストが差分として混入する不整合を見つけた。他の変更（focus.sh の解決順序、record-failure.sh / promote-gate.mjs の focus 読み取り、diff-hash.sh の除外、precommit-gate.sh の部分ステージ検査との整合）は tasks.md の主張と実装が一致しており、目立った欠陥は見当たらなかった。

- scripts/harness/review.sh:39 レビューへ渡す `$diff`（36〜40行目）は `diff-hash.sh` と違い `openspec/changes/*/reviews.md` を除外していない。D6 でハッシュ計算からは reviews.md を除いたが、プロンプトに埋め込む実際の差分抽出はそのまま `git diff --cached`／`git diff HEAD` を使っている

## 2026-09-12T09:03:48Z  hash=ba28126b1810776549b252974dfec2b9445cb33a8a1d73e6f181d17c6e5d8aec  findings=1

タスク4.1の完了主張とreviews.mdの記録に食い違いがある。2.5の修正後、findings=0の3回目レビューが記録されておらず、現在の差分に対応する受領書の存在が確認できない。他の実装（focus解決順序、record-failure/promote-gateのfocus読み取り、diff-hashとreview.shの除外、部分ステージ検査との整合）はtasks.mdの主張と一致しており問題は見当たらなかった。

- openspec/changes/review-with-change-context/tasks.md:40 タスク4.1は[x]で「受領書を作り、コミットの門を通す」と主張しているが、reviews.mdに記録された2回のレビュー（07:11:42Z, 07:31:06Z）はいずれもfindings=1で、review.shの設計上findings!=0のときは受領書(.harness/reviews/*.json)を作らない。2回目の指摘（2.5、review.shがモデルに渡す$diffがreviews.mdを除外していない件）はこの差分で修正されているが、その修正後にfindings=0で通った3回目のレビューがreviews.mdに記録されていない。コードが変わっているためdiff-hashも2回目の受領書のhash(dcada646...)とは一致せず、この差分に対応する有効な受領書が存在する証拠がない。

## 2026-09-12T09:07:53Z  hash=0add6407a8f1b441bbee6f28f5699fbe8a4abfe402d4dab4dd8d35e51d51c200  findings=0

この差分（focus宣言・reviews.md追記・D6のハッシュ除外）を通して読んだが、確信の持てる正しさの欠陥は見つからなかった。diff-hash.sh と review.sh の exclude pathspec（`:(exclude)openspec/changes/*/reviews.md`）は同一条件・同一タイミングで一貫しており、reviews.md の除外がハッシュと差分の両方に効いている。focus.sh の --resolve と promote-gate.mjs の focusChange() は同じ決定順序（宣言→1件のみなら採用→null）を独立実装しているが、promote-gate.mjs は `existsSync` のみでディレクトリ判定を省いている点が focus.sh の `-d` チェックと非対称——実害は考えにくく確信が持てないため findings には挙げていない。tasks.md の [x] 項目（1.1〜4.1）は対応する実装・テストが揃っており、テスト件数の主張（7件・19件・3件など）も実ファイルの内容と一致している。
