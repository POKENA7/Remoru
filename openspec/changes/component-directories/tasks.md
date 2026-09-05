## 1. 下ごしらえ

- [x] 1.1 移動前の基準を取る。`npm run check` を通し、`vitest run` が拾った
      ファイル数とテスト件数を控える。移動後にこの数と一致することが完了条件
- [x] 1.2 `features/sheet/`、各 feature の `components/`、`hooks/`、
      `tests/helpers/` を作る（design D1・D2・D3）。`npm run check` が緑のまま

## 2. 機能ごとに移す

各タスクは「`git mv` で実装とテストを移す → feature 内の相対 import はそのまま →
feature をまたぐ import を `@/features/<機能>/…` に → 外側の参照を追従」までを
1 つにまとめる。**完了条件は `npm run check` が緑になること**（壊れた状態を
コミットに残さない）。

- [x] 2.1 `features/sheet/` へ `app/sheet.tsx` `app/sheet-drag.ts`（＋テスト）。
      3 か所（`memo-detail` `quiz-sheet` `notification-settings`）の参照を追従
- [x] 2.2 `features/first-run/` へ `app/first-run-view.ts`（＋テスト）、
      `components/` へ `app/first-run-notice.tsx`
- [x] 2.3 `features/record/components/` へ `app/record-tab.tsx`
- [x] 2.4 `features/notification/` へ `app/push-subscribe.ts`（＋テスト）、
      `components/` へ `app/notification-settings.tsx`
- [x] 2.5 `features/tag/` へ `app/tag-picker.ts`（＋テスト）、
      `components/` へ `app/tag-suggestion-band.tsx`
- [x] 2.6 `features/quiz/components/` へ `app/quiz-sheet.tsx`
- [x] 2.7 `features/review/` へ `app/cells.ts`（＋テスト）、
      `components/` へ `app/review-tab.tsx`
- [x] 2.8 `features/memo/` へ `app/detail-selection.ts` `app/fresh-memo.ts`（＋テスト）、
      `components/` へ `app/memo-tab.tsx` `app/memo-detail.tsx`

## 3. 型の分割と重複の解消（design D6）

- [x] 3.1 `app/types.ts` を割る。`MemoRow` `ReviewState` `TagRef` `formatDay` を
      `features/memo/types.ts` へ、`DueItem` を `features/review/types.ts` へ。
      参照 8 か所を追従させる
- [x] 3.2 `MAX_CONTENT_LENGTH` の重複を消す。`types.ts` 側を削除し、
      `features/memo/memos.ts` から import する。**値が 2 か所にある状態を
      終わらせる**。`npm run check` が緑

## 4. `lib/` を絞り、横断のものを分ける（design D3）

- [x] 4.1 `app/session-state.ts` を `hooks/use-session-state.ts` へ。
      参照（`app-shell.tsx`）を追従
- [x] 4.2 `lib/test-db.ts` `lib/test-d1.ts` を `tests/helpers/` へ。
      参照 18 か所と、**`cron-worker/tsconfig.json` の include** を追従させる

## 5. アーキテクチャテストを集約して改名する（design D4）

移動が全部終わってから行う。移動中に落ちた検査を元の名前で追えるようにするため。

- [x] 5.1 `tests/architecture/` を作り、9 本を `git mv` して `*.arch.test.ts` に
      改名する:
      `auth` `query` `cron` `navigation` `scheduler` `sheet` `unmount`
      `memo-list` `target-size`。
      **これらは `process.cwd()` からソースを読むので、テスト自身が動いても
      読む先は壊れない**
- [x] 5.2 アーキテクチャテストでない 2 本を外す（design D4）。
      `lib/cascade.test.ts` → `db/cascade.test.ts`、
      `lib/isolation.test.ts` → `tests/isolation.test.ts`。
      どちらも実際に DB を動かす普通のテストで、ソースを読まない
- [x] 5.3 `lib/` に残ったのが `db.ts` `session.ts` `request-clock.ts` の 3 本
      だけであることを `ls lib` で確認する
- [x] 5.4 文中の参照を追う。`grep -rn 'boundary' --include='*.md' --include='*.ts'`
      で洗い、`.learnings/active.md` `CLAUDE.md` と**進行中の** change の
      design / tasks を直す。
      **archive 済みの change は書き換えない**——当時の名前で正しい歴史である
- [x] 5.5 `npm run check` が緑。ファイル数・テスト件数が 1.1 と一致すること

## 6. パスを直書きしている 2 本を直す（design D5）

- [x] 6.1 `target-size.arch.test.ts` と `sheet.arch.test.ts` を、
      **対象を内容で選ぶ形**に直す。`features/**/components/*.tsx` を走査し、
      シートを使っているもの・押せる要素を持つものを対象にする。
      走査対象が 0 件なら落ちる検査を併せて置く
- [x] 6.2 6.1 を L06 で確かめる。**実測の記録**:
      (a) `features/sheet/probe.tsx` に「外枠を自前で書く部品」を足す → 赤（EXIT=1）。
      走査で自動的に対象になっている。
      (b) 走査の起点を `nowhere` に壊す → 赤（EXIT=1）。
      どちらも戻して緑（EXIT=0）。
      **途中で見つけた欠陥**: `endsWith("sheet.tsx")` が `quiz-sheet.tsx` にも
      当たっていた。基準名で厳密に見る形に直した

## 6b. 層の向きを固定する（design D8・レビューの指摘で追加）

- [x] 6b.1 `SuggestionResult` を `app/app-shell.tsx` から
      `features/tag/types.ts` へ移す。移動で `features/` → `app/` の
      逆向き参照ができ、**循環参照になっていた**
- [x] 6b.2 `tests/architecture/layers.arch.test.ts` を足す。
      `features/` `lib/` `hooks/` が `app/` を参照しないこと、
      `lib/` が `features/` を参照しないこと。
      違反を 2 種注入して赤くなることを確かめた（L06）

## 7. 移動が中身を変えていないことの確認

- [x] 7.1 `git diff -M --stat` を取り、内容が変わったファイルを一覧する。
      **変わってよいのは import 行のみのファイル、6.1 で直した検査 2 本、
      3.2 の `MAX_CONTENT_LENGTH`、`cron-worker/tsconfig.json` だけ**。
      それ以外に差分があれば戻す
- [x] 7.2 1.1 で控えたファイル数とテスト件数に `vitest run` の出力が一致すること。
      **結果**: 48 ファイル（一致）／571 件（基準 570 + 1）。増えた 1 件は 6.1 で
      足した「走査で外枠そのものが見つかる」
- [x] 7.3 `ls app` が `layout.tsx` `globals.css` `manifest.ts` `app-shell.tsx`
      `(app)` `api` `sign-in` `sign-up` だけになっていること
- [x] 7.4 feature をまたぐ実装の import を数え、`feature-directories` の時点の
      3 本から**どこからどこへ増えたか**を design.md に記録する。
      **結果**: 3 本 → 10 本。増えた 7 本はすべて画面が複数の機能を並べることに
      よるもので、ドメイン層の依存は `review-scheduler` 宛の 3 本のまま

## 8. 締め

- [x] 8.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [x] 8.2 CI が緑になったことを見る（L07）。**結果**: run 33952324909 が success
- [x] 8.3 `CLAUDE.md` の「置き場」の節を書き直す。(a) 部品は
      `features/<機能>/components/`、(b) `lib/` は外部ライブラリのラッパーだけ、
      (c) `hooks/` `tests/` の役割、(d) `tests/architecture/`（`*.arch.test.ts`）と
      `scripts/harness/` の違い——前者はアプリの設計規則、後者は検査そのものの検査

---

## この change の外に残っている宿題

忘れないように書き出しておく。**この change では扱わない。**

- **学びの棚卸。** `.learnings/active.md` が 13 件で起動条件（12 件超）を
  超えている。削除の承認は人が行う手順なので止めてある。
  引用数だけで切ると L01 / L02 / L08 / L09（コマンドの書き方や作業手順）が
  真っ先に消えるが、これらは実際に効いている
- **`server-side-reads` の残り**（タスク 3.1 以降）。この change のあとに戻る。
  未完のまま置いてあるのは 2.2 / 2.3 / 3.3 と、タスク 3〜6
- **dependency-cruiser の導入**（design D7）。import グラフの規則を AST ベースで
  見る。Biome を置き換えず併用する。効くのは 10 本中 1.5 本ぶんなので、
  この change には混ぜない。linter の乗り換え（oxlint / ESLint）は見送り——
  oxlint は regex パターンで side-effect import を拾えず、`import "server-only"`
  がまさにそれに当たる
- **実機での確認**（`server-side-reads` タスク 5）。2.2 と 3.3 はサインイン済みの
  画面をこの環境で確かめられないため、そこで閉じる
- **詳細を開いても履歴に積まれない**（`navigation` spec の MUST NOT に触れて
  いる状態）。`server-side-reads` タスク 3.5 で直す
