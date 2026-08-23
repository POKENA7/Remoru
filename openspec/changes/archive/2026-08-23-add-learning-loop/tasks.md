## 1. `.learnings/` の足場を作る

- [x] 1.1 `.learnings/active.md` を作成し、冒頭に運用ヘッダを置く。ヘッダには「学びは『規則 + それを生んだ出来事』で書く」「適用したら commit に `Learning: LNN` を1行足す」「12件を超えたら棚卸を起動する」の3点を記す。検証: `head -6 .learnings/active.md` にこの3点がすべて現れること
- [x] 1.2 初期5件を `active.md` に投入する。各件は design.md D1 の形式（1行目=規則、2行目=出来事、3行目=次にどうするか）に従う。内容は下記をそのまま使う。検証: `grep -c '^- \*\*\[L0' .learnings/active.md` が `5` を返し、各件に出来事の行が存在すること

  - **[L01] `rm` は `-f` を付けて呼ぶ** — このマシンの zsh は `rm` が対話モードにエイリアスされており、確認待ちでコマンドが2分間ハングして初めて気づいた。破棄が確実な場面では `rm -f` を使う。
  - **[L02] 既存ファイルの上書きは `>|`** — `noclobber` が有効なため `cat > file` が「file exists」で失敗する。change 1 で2回踏み、どちらも heredoc の中身が丸ごと実行されずに黙って消えた。上書き意図があるときは `>|` を使う。
  - **[L03] headless Chrome の配色切替は CDP で行う** — `--blink-settings=preferredColorScheme` も `--force-dark-mode` も効かず、ライト用とダーク用に撮った2枚がバイト単位で同一になった。フラグは静かに無視される。`Emulation.setEmulatedMedia` を CDP 経由で使う。
  - **[L04] 配色の性質を主張する前に実測する** — ダークモードを「暖色ベースにした」と報告したが、レンダリング結果から色相を測ったら背景は257＝紫だった。意図ではなく計算値で確かめる。
  - **[L05] spec のシナリオはブラウザで一通り辿る** — 単体テスト18件が全て緑でも、空白のみで保存を試した後のエラーが1001文字入力時にも残り続ける欠陥が残っていた。ブラウザでシナリオを順に辿って初めて見つかった。

- [x] 1.3 各件が**判断可能**であることを確認する。検証: 5件それぞれについて「この記述だけで、半年後に残すか消すかを判断できるか」を自問し、出来事が特定できない件があれば書き直す。規則だけの件を1件も残さないこと
- [x] 1.4 `.learnings/index.json` を作成し、L01〜L05 のメタデータ（`id` / 種別 / 捕捉元 change / 引用数0）を記録する。検証: `python3 -m json.tool .learnings/index.json > /dev/null` が成功し、要素数が5であること
- [x] 1.5 `.learnings/archive.md` を作成し、change 1 の選別で active に入らなかった3件を理由付きで記録する（昇格1件: 「アクセント色を反転したら文字色も反転する」→ コントラストの回帰テストへ／却下2件: 「`rm` の対話モード」は L01 に統合、「npm overrides の入れ子構文が効かない」は基準2・3を満たさず）。検証: 3件すべてに「昇格」または「却下」の別と理由が1行以上書かれていること
- [x] 1.6 `archive.md` の冒頭に棚卸の手順を記す（起動条件: active が12件を超えたとき、または change のアーカイブ時／判定: 引用0件かつ3 change経過→削除提案、引用3件以上→昇格提案、それ以外は継続／削除の承認は人間）。検証: `head -8 .learnings/archive.md` に起動条件と3つの判定規則がすべて現れること

## 2. 文脈への配線

- [x] 2.1 `CLAUDE.md` に `@.learnings/active.md` の1行を追加する。検証: `git diff --stat CLAUDE.md` が1ファイル1行の追加のみを示すこと。**他の記述をこの機会に整理しないこと**（ロールバックの単純さが design.md の Migration Plan の前提）
- [x] 2.2 新規セッションで @import が実際に効いていることを確認する。検証: 新しいセッションを開き、`.learnings/active.md` を明示的に読ませずに L02 の内容（`noclobber` のため上書きは `>|`）を答えられること。答えられなければ配線が失敗しているので、パスの相対解決を見直す。**このタスクは人間にしか実行できない**
- [x] 2.3 `.learnings/` が `.gitignore` に引っかからないことを確認する。検証: `git check-ignore -v .learnings/active.md` が何も返さないこと

## 3. 運用の開始

- [x] 3.1 この change 自体のコミットには `Learning:` trailer を付けない（適用ではなく仕組みの導入であるため）。次の change から引用を開始する。検証: この change のコミットメッセージに `Learning:` が含まれないこと
- [x] 3.2 引用の集計コマンドが実際に動くことを確認する。検証: `git log --grep "Learning: L05" --oneline | wc -l` がエラーなく数値（この時点では `0`）を返すこと

## 4. スコープ境界の確認

- [x] 4.1 段階2（`.learnings/review.mjs`、`npm run learnings:review`、`openspec/config.yaml` の `operations.archive.guidance` への追記）を**行っていない**ことを確認する。検証: `ls .learnings/` が `active.md` / `index.json` / `archive.md` の3ファイルのみを返し、`openspec/config.yaml` に差分がないこと
- [x] 4.2 段階3（`.claude/settings.json` の `Stop` フック、種別タグによる条件付き読み込み）を**行っていない**ことを確認する。検証: `git status --short` に `.claude/settings.json` が現れないこと
- [x] 4.3 昇格分（コントラストの回帰テスト）の実装は**この change では行わない**。`archive.md` に昇格先として記録するのみとし、テスト自体は別 change として立てる。検証: 製品コードとテストコードに差分がないこと

## 5. 完了の検証

- [x] 5.1 ロールバックの単純さを確認する。検証: `git status --short` の変更が `.learnings/`（新規3ファイル）と `CLAUDE.md`（1行）だけであること。この2つを戻せば完全に元に戻る状態を保つ
- [x] 5.2 change のバリデーションを通す。検証: `openspec validate add-learning-loop --strict` が成功すること
- [x] 5.3 `active.md` の実測サイズを `archive.md` の冒頭に記録する。検証: `wc -c .learnings/active.md` の値が記録されていること。**これは門ではなく観測値**であり、段階2に進むかどうかの判断材料として残す
