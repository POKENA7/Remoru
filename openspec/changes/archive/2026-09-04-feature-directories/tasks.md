## 1. 下ごしらえ

- [x] 1.1 移動前の基準を取る。`npm run check` を通し、`vitest run` が拾ったテスト
      ファイル数とテスト件数を控える。移動後にこの数と一致することが完了条件になる
- [x] 1.2 `check:types` を `tsc --noEmit && npm --prefix cron-worker run typecheck` に
      変える（design D6）。`cron-worker/src/index.ts` に型エラーを 1 つ注入し、
      `npm run check:types` が**赤くなる**ことを確かめてから注入を戻す（L06）
- [x] 1.3 `features/` を作り、`memo` `review` `quiz` `tag` `notification` `record`
      `first-run` の 7 ディレクトリを置く。`npm run check` が緑のままであること

## 2. feature ごとの移動

各タスクは「`git mv` で実装とテストを移す → feature 内の相対 import はそのまま →
feature をまたぐ import を `@/features/<機能>/…` に書き換える → 外側（`app/`
`cron-worker/`）の参照を追従させる」までを 1 つにまとめる。**各タスクの完了条件は
`npm run check` が緑になること**（design D7: 壊れた状態をコミットに残さない）。

そのモジュールをファイルとして読むアーキ検査テスト（design D8）の path 定数も、
同じタスクの中で直す。直さないと `readFileSync` が投げてそのタスクが緑にならない。

- [x] 2.1 `features/notification/` へ `push.ts` `notification-timing.ts`
      `notification-message.ts` `notification-settings.ts`
      `notification-subscriptions.ts` とその 5 本のテストを移す。
      `cron-worker/src/{index,send,notifications.test}.ts` の `../../lib/` 参照 4 本と
      `cron-worker/tsconfig.json` の `include` を追従させる。
      `npm run check` が緑（cron-worker の型検査を含む）
- [x] 2.2 `features/first-run/` へ `first-run.ts` `first-run-text.ts` と
      そのテストを移す。`review` への実装依存 1 本を `@/features/review/…` にする
      ——ただし `review` は未移動なので、この時点では `@/lib/…` のまま置き、
      2.7 で書き換える。`npm run check` が緑
- [x] 2.3 `features/record/` へ `learning-record.ts` `retention-layers.ts` と
      そのテストを移す。`npm run check` が緑
- [x] 2.4 `features/tag/` へ `tags.ts` `tag-text.ts` `tag-suggestion.ts`
      `tag-suggestion-run.ts` `tag-suggestion-client.ts` とそのテストを移す。
      `npm run check` が緑
- [x] 2.5 `features/quiz/` へ `quiz-items.ts` `quiz-text.ts` `quiz-generation.ts`
      `quiz-generation-run.ts` `quiz-generation-client.ts` とそのテストを移す。
      `npm run check` が緑
- [x] 2.6 `features/memo/` へ `memos.ts` とそのテストを移す。`npm run check` が緑
- [x] 2.7 `features/review/` へ `review.ts` `review-scheduler.ts` とそのテストを移す。
      **2.2 / 2.5 / 2.3 が残した `review` への参照 3 本を `@/features/review/…` に
      書き換える**。`cron-worker` の `review-scheduler` 参照も追従させる。
      `npm run check` が緑
- [x] 2.8 `lib/` に残った実装が `db.ts` `current-user.ts` `test-db.ts` `test-d1.ts` の
      4 本だけであることを `ls lib` で確認する。
      **実装中の判断**: 1 つの feature に属さない横断テストは `lib/` に残す
      （`auth-boundary` `cron-boundary` `cascade` `isolation` `test-db.test`）。
      当初は「テストも 1 本も残さない」と書いていたが、これらは複数の feature を
      またいで境界を検査するもので、どれか 1 つの feature に置くと
      検査の意味が feature に閉じてしまう。`lib/` = 横断（design D4）と一貫する

## 3. アーキ検査の走査範囲（design D8）

- [x] 3.1 `lib/auth-boundary.test.ts` の「Clerk を知るのは 1 ファイルだけ」の走査を
      `lib/` と `features/**` の両方に広げる。`features/` 側の適当な 1 ファイルに
      `import { auth } from "@clerk/nextjs/server";` を注入し、`npm run check:test` が
      **赤くなる**ことを確かめてから注入を戻す（L06）
- [x] 3.2 同ファイルの「ドメイン層は認証事業者を import していない」の対象
      （`memos` `quiz-items` `review` `review-scheduler`）を移動後の path に直す。
      4 件が緑で通ること
- [x] 3.3 `expect(importers)` の期待値を `["session.ts"]` にする（4.1 の改名後）。
      `npm run check` が緑

## 4. 改名

- [x] 4.1 `lib/current-user.ts` を `lib/session.ts` に `git mv` する（design D5）。
      中身は変えない。`@/lib/current-user` を参照している 13 箇所を
      `@/lib/session` に書き換える。`grep -rn "lib/current-user" .` が
      （このディレクトリの計画文書を除いて）0 件になること。`npm run check` が緑

## 5. 移動が中身を変えていないことの確認

- [x] 5.1 `git diff -M --stat main...HEAD` を取り、リネームとして検出されなかった
      ファイル、および内容が変わったファイルを一覧する。**変わってよいのは
      import 行のみのファイルと、`package.json` `cron-worker/tsconfig.json`、
      および D8 が挙げたアーキ検査テスト（path 定数・走査範囲）だけ**。
      それ以外に差分があれば戻す
- [x] 5.2 1.1 で控えたテストファイル数とテスト件数に、`vitest run` の出力が
      一致することを確かめる。減っていたら移動で拾われなくなったテストがある。
      **結果**: 46 ファイル（一致）／527 件（基準 526 + 1）。増えた 1 件は 3.1 で
      足した「走査対象が空でない」。減ったものは無い
- [x] 5.3 feature をまたぐ**実装**の import が **3 本**（行き先はすべて
      `features/review/`）であることを確かめる。design.md の実測値と一致しなければ、
      移動の途中で依存が増えている。
      テストは対象外にする——テストは検証のために他 feature を自由に呼ぶので、
      同じ数え方をすると 19 本になり、境界の指標にならない:
      `grep -rn 'from "@/features/' features/ --include='*.ts' | grep -v '\.test\.ts'`
      **結果**: 3 本。`record/learning-record.ts` `quiz/quiz-items.ts`
      `first-run/first-run-text.ts` から、いずれも `review/review-scheduler` へ

## 6. 締め

- [x] 6.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [x] 6.2 CI（`.github/workflows/ci.yml`）が緑になったことを見て完了とする。
      **結果**: run 33873598961 が 54s で success。Linux 上でも cron-worker の
      型検査を含めて通った。
      手元で緑でも CI で落ちる欠陥は過去 4 件出ている（L07）。特に 1.2 で足した
      cron-worker の型検査は CI で初めて Linux 上を走る
- [x] 6.3 `docs/design-decisions.md` か `CLAUDE.md` に、`features/` と `lib/` の
      使い分け（機能を持つものは `features/`、横断は `lib/`）を 3 行で書き足す。
      次に迷ったとき、この change の design.md まで辿らずに済むようにする
