## 1. 現状を数で固定する

- [x] 1.1 変更前の `npx vitest run` のファイル数とテスト件数を記録する。
  検証: 47 ファイル / 558 件であることを実行結果で確かめ、以降の比較の基準にする
- [x] 1.2 変更前のフルスイートを 3 回走らせ、`scripts/harness` の各テストの所要時間を
  記録する。検証: `check:types は型の合わないファイルで落ちる` が 5,000ms 付近に
  張り付いていること（＝欠陥が今も再現すること）を数で示す

## 2. vitest の設定を分ける（E1 / E2）

- [x] 2.1 `vitest.config.ts` に `projects` を導入し、`app`（`**/*.test.ts` から
  `scripts/harness/**` を除く）と `harness`（`scripts/harness/**/*.test.ts`）に分ける。
  `resolve.alias` は `extends: true` で両方に継承させる。
  検証: `npx vitest run` のファイル数とテスト件数が 1.1 の値と**完全に一致**すること
  （project 分割で静かに走らなくなったファイルが 1 つも無いこと）
- [x] 2.2 `harness` project に `testTimeout: 60_000` と `hookTimeout: 60_000` を与える（E2）。
  検証: `app` project 側の予算が既定の 5,000ms のままであることを、
  わざと 6 秒眠るテストを app 側に一時的に置いて**赤くなる**ことで確かめ、その後取り除く
- [x] 2.3 `sequence.groupOrder` の効果を同一条件で A/B 測定し、入れるかどうかを決める。
  検証: 負荷を固定して 6 回ずつ測り、中央値の差が実行ごとのばらつきを超えること。
  **結果: 超えなかった（1,658ms vs 1,371ms、差 290ms）。効果を確認できないので
  入れない。** design E3 を撤回の記録に書き換えた
- [x] 2.4 `npx vitest run scripts/harness` のような CLI でのファイル絞り込みが
  `projects` 導入後も効くことを確かめる。検証: 5 ファイル / 39 件だけが走ること

## 3. 一時ファイルの置き場を分ける（E4）

- [x] 3.1 `scripts/harness/checks.test.ts` の置き場を `harness-tmp/p<pid>/` にし、
  `afterEach` はその下だけを消すようにする。`harness-tmp/` 自体は空のときだけ片付ける。
  検証: `npx vitest run scripts/harness` が緑で、実行後に `harness-tmp/` が残っていないこと
- [x] 3.2 冒頭コメントの 3 点（リポジトリ内に置く理由 = L09 / 名前にドットを付けない理由 /
  `--max-diagnostics=none` の理由）が**そのまま残っている**ことを確かめ、
  今回プロセスごとに分けた理由をコメントに足す。
  検証: 差分を読み、既存の理由の記述が 1 行も消えていないこと
- [x] 3.3 2 つの vitest を同時に走らせても互いの注入ファイルを消さないことを確かめる。
  検証: `npx vitest run scripts/harness/checks.test.ts` を 2 本同時に起動し、
  両方が緑で終わること（変更前は片方が落ちうる）

## 4. 検査が検査のままであることを確かめる（L06 / D10）

- [x] 4.1 **検査が見逃す側の違反を 1 つ注入する。** `biome.json` の `files.includes` に
  `!harness-tmp` を足して `check:format` / `check:lint` が注入ファイルを見なくなる
  状態を作る。検証: `checks.test.ts` の該当テストが**赤くなる**こと。
  確かめたら `biome.json` を元に戻す
- [x] 4.2 同じことを `check:types` でも行う。`tsconfig.json` の `exclude` に
  `harness-tmp` を足す。検証: `check:types は型の合わないファイルで落ちる` が
  **赤くなる**こと。確かめたら元に戻す
- [x] 4.3 4.1 / 4.2 が緑に戻ることを確かめる。検証: `npx vitest run scripts/harness` が
  5 ファイル / 39 件すべて緑

## 5. 負荷をかけて安定を確かめる

- [x] 5.1 `next build` と同時にフルスイートを走らせる。
  検証: `scripts/harness` が 1 件も落ちないこと。最大所要時間を記録し、
  60,000ms の予算に対する余裕を数で示す
- [x] 5.2 CPU を過負荷（コア数の 2 倍以上のプロセス）にした状態でフルスイートを走らせる。
  検証: `scripts/harness` が 1 件も落ちないこと
- [x] 5.3 `npm run check` を 3 回連続で通す。検証: 3 回とも終了コード 0

## 6. 記録と CI

- [x] 6.1 `.learnings/active.md` に学びを 1 件足す（規則 + それを生んだ出来事）。
  検証: 既存の書式（**[LNN]** + 出来事 + 規則）に沿っていること。件数が 12 を
  超えるなら `.learnings/archive.md` 冒頭の棚卸手順に従う
- [x] 6.2 `.github/workflows/ci.yml` を**変更しないまま**であることを確かめる（E5）。
  検証: 差分に `.github/` が含まれていないこと
- [ ] 6.3 `npm run harness:review` を通し、受領書を作る。
  検証: findings 0 件で受領書が `.harness/reviews/` に出来ること
- [ ] 6.4 コミットして push し、CI を緑で通す。
  検証: GitHub Actions の `check` ジョブが成功すること。落ちたら、
  手元では出ない差（L07）として原因を記録してから直す
