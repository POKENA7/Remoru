## 1. Biome の導入と一括整形（コミット 1）

- [x] 1.1 `npm i -D -E @biomejs/biome`（2.5 系）を入れ、`npx biome --version` がバージョンを返すことを確認する
- [x] 1.2 `biome.json` を作る。`recommended` のみ有効、`files.includes` から `.next` / `.open-next` / `.wrangler` / `node_modules` / `drizzle` を除外し、`npx biome check .` が生成物を 1 件も読まないことを出力件数で確認する
- [x] 1.3 `npx biome check --write .` で一括整形し、`npm run test` と `npm run typecheck` が整形前と同じ結果（緑）であることを確認する
- [x] 1.4 整形だけを独立コミットにする（D13）。`git show --stat` にコード以外の変更が混ざっていないことを確認する

## 2. 検査の単一入口

- [x] 2.1 `package.json` に `check:format` / `check:lint` / `check:types` / `check:test` / `check:secrets` と、束ねる `check` を追加する。中身は既存の `test` / `typecheck` / `scripts/scan-secrets.sh` を呼ぶだけにする（D1）
- [x] 2.2 `npm run check` が全部緑で終了コード 0 を返すことを確認する
- [x] 2.3 `predeploy` を `npm run check` に置き換え、検査の定義が 2 か所に無いことを `grep -n "vitest\|tsc --noEmit" package.json .claude .github` で確認する（scripts 以外に出てこないこと）

## 3. 検査が壊れたら赤くなることの検査（L06 の昇格）

- [x] 3.1 `scripts/harness/checks.test.ts` を作り、`check:format` / `check:lint` / `check:types` に**わざと壊した一時ファイル**を食わせて非ゼロ終了することを assert する（D10）。3 件とも赤を確認してから緑に戻す
- [x] 3.2 `check:secrets` の注入テストを書く。**使い捨ての git リポジトリ**を作り、大文字と数字を含む鍵の形の値をコミットしてから `scan-secrets.sh` を走らせ、非ゼロで終わることを assert する（作業ツリーに置くだけでは入力に入らない — L09）
- [x] 3.3 3.1・3.2 のテストが、注入をやめると緑に戻ることを確認する（常に赤いテストは検査ではない）

## 4. hooks（コミット 2）

- [x] 4.1 `.claude/settings.json` に `PostToolUse`（matcher `Edit|Write`）を置き、`scripts/harness/format-file.sh` が `tool_input.file_path` の `.ts` / `.tsx` だけを `biome check --write` することを確認する。実際に未整形のまま `.ts` を Write し、保存後にファイルが整形されていることを目視で確認する
- [x] 4.2 4.1 の hook が `.md` や `.json` の編集では何もせず exit 0 することを確認する（対象外のファイルで発火しないこと）
- [x] 4.3 `scripts/harness/stop-gate.sh` を書く（D4）。`stop_hook_active` が true、または `git status --porcelain` が空なら即 exit 0。それ以外は `check:types` と `check:test` を走らせ、失敗したら exit 2
- [x] 4.4 `scripts/harness/stop-gate.test.ts` を書き、3 つの入力（再入 / 差分なし / 検査失敗）に対する終了コードが 0 / 0 / 2 になることを assert する。**検査失敗の入力で 2 が返ることを実際に赤を出して確認する**
- [x] 4.5 `.claude/settings.json` に `Stop` hook として 4.3 を登録し、わざと型エラーを残したままターンを終えようとして**実際にブロックされる**ことを確認する

## 5. コミット前の門

- [x] 5.1 `scripts/harness/precommit-gate.sh` を書く。stdin の `tool_input.command` を `jq` で読み、`git commit` を含むときだけ働く（`if` フィルタは使わない — D5）。判定できない入力は落とす側に倒す
- [x] 5.2 門から `npm run check` を走らせ、1 つでも落ちたら exit 2 で stderr に落ちた検査名を出すことを確認する
- [x] 5.3 差分のハッシュ H を計算し、`.harness/reviews/H.json` が無い、または `findings` が空でないなら exit 2 する（D6）。stderr に `npm run harness:review` の実行を促す 1 行を出す
- [x] 5.4 `scripts/harness/precommit-gate.test.ts` を書き、(a) 受領書なし → 2、(b) 受領書あり findings 空 → 0、(c) 受領書を作った後に差分を変える → 2、(d) `git commit` を含まない Bash → 0、の 4 ケースを assert する
- [x] 5.5 `.claude/settings.json` に `PreToolUse`（matcher `Bash`）として登録し、受領書が無い状態で実際に `git commit` を試みてブロックされることを確認する

## 6. レビューの実行系

- [x] 6.1 `claude -p` が非対話でこのリポジトリの差分をレビューできるかを 1 回実測する（D7 の第 1 候補）。使えなければ `type: "agent"` hook に切り替え、どちらを採ったかを design.md の D7 に追記する
- [x] 6.2 `scripts/harness/review.sh` と `npm run harness:review` を作る。差分をレビューさせ、`.harness/reviews/H.json` に `{hash, ts, findings[], body}` を書く。findings があるときは受領書を書かずに非ゼロで終わる
- [x] 6.3 わざと欠陥のある差分（例: 使われない await の欠落）でレビューを走らせ、**受領書が作られずコミットが通らない**ことを確認する。欠陥を直すと受領書ができて通ることも確認する
- [x] 6.4 `.harness/` の扱いを決めて `.gitignore` に反映する（受領書は履歴に要らない。`promotions.json` は要る場合は別扱い）

## 7. 失敗の記録と棚卸の強制（コミット 3）

- [x] 7.1 `scripts/harness/record-failure.sh` を書き、D8 のスキーマ 1 行を `.learnings/failures.jsonl` に追記する。`check:secrets` の失敗では `head` を記録しないことをテストで確認する
- [x] 7.2 4.3 と 5.1 の両方から 7.1 を呼ぶ。検査を落として実際に 1 行増えることを確認する
- [x] 7.3 `scripts/harness/promote-gate.mjs` を書く。`failures.jsonl` を check ごとに数え、同一 change で 3 回以上かつ `promotions.json` に決定が無いものを「未処理の候補」として返す（D9）
- [x] 7.4 `Stop` hook に 7.3 を組み込む。未処理の候補があれば exit 2 で「規則 / 検査 / 見送り」を選ばせる。**1 候補につきブロックは 1 回**であることを、同じ候補で 2 回連続ブロックされないテストで確認する
- [x] 7.5 `npm run harness:promote -- --check <id> --decision rule|check|skip --note "..."` を作り、`.harness/promotions.json` に書く。実行後に 7.4 のブロックが外れることを確認する
- [x] 7.6 `promote-gate.test.ts` を書き、同一 check の失敗 3 件を書いた `failures.jsonl` でブロックが立ち、`skip` の決定を書くと外れることを assert する

## 8. 引用数の自動集計

- [x] 8.1 `npm run learnings:index` を作り、`git log --grep "Learning: L"` から引用数を数えて `.learnings/index.json` を書き直す（D11）
- [x] 8.2 実行し、L03=2 / L04=9 / L05=5 / L06=24 という実測値に一致することを確認する（現在の手書きの値は 0 と 1 で、15 change ぶんずれている）
  - L03=2 / L04=9 / L05=5 は一致した。**L06 だけ 26 になり、24 と合わない。**
    原因は proposal の `grep -o "Learning: L[0-9]*"` にある。`Learning: L04, L06` と
    2 つ並べた trailer が 2 件あり、その形を **L04 としか数えていなかった**。
    集計側を直して両方数えるようにしたので、L06 は 24 + 2 = 26 が正しい。
    この change のコミット 2 件を含めた現在値は 28。
- [x] 8.3 `harness:promote` と CI から 8.1 を呼ぶ。`Stop` hook からは呼ばない

## 9. CI

- [x] 9.1 `.github/workflows/ci.yml` を作る。`push` と `pull_request` で Node 22 + `npm ci` + `npm run check`。秘密情報は使わない（D12）
- [ ] 9.2 わざと型エラーを入れたブランチを push し、**CI が赤くなることを実際に確認する**。確認後に戻す
- [x] 9.3 CI が `npm run check` 以外の検査定義を持たないことを、ワークフロー本文の目視で確認する

## 10. 記録と仕上げ

- [x] 10.1 `.learnings/active.md` の L06 に「実行可能な検査へ昇格済み（この change）」を追記し、`.learnings/archive.md` の昇格の節に記録する。未実装のまま残っている「コントラストの回帰テスト」の扱い（今回は対象外）も明記する
- [x] 10.2 `CLAUDE.md` にハーネスの節を足す。どの契機で何が走るか、落ちたときにどうするか、`disableAllHooks` を使ったら `.learnings` に記録すること、の 3 点
- [ ] 10.3 `npm run check` を最初から通し、全部緑であることを確認する
- [ ] 10.4 `bash scripts/scan-secrets.sh` を**コミット 2・3 を作った後に**走らせる（履歴の blob が入力なので、コミット前では新しい行が入力に入らない — L09）
- [ ] 10.5 このリポジトリで実際に 1 コミットを最後まで通し、3 段の hook が順に働くことを確認する（編集で整形 → ターン終了で test → コミットで検査とレビュー）
