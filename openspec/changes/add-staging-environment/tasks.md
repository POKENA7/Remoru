## 1. 設定

- [ ] 1.1 `npx opennextjs-cloudflare deploy --help` で環境名を渡す旗を確かめ、design の Open Questions に答えを書く
- [ ] 1.2 `wrangler.jsonc` に `env.staging` を足す。`name` `assets` `d1_databases`（`remoru-db-staging`）を
      **もう一度書く**（継承されない）。`database_id` は 2.1 で作ってから埋める
- [ ] 1.3 `cron-worker/wrangler.jsonc` に `env.staging` を足す。`name` `triggers` `d1_databases` を書く
- [ ] 1.4 `scripts/harness/staging-isolation.test.ts` を書く（design D3）。staging の `database_id` を
      本番と同じにして赤、戻して緑を確かめる（L06）
- [ ] 1.5 `package.json` の `deploy` を消し、`deploy:staging` `deploy:staging:cron` `deploy:production` を
      足す（design D2）。`predeploy:staging` が `check` を呼ぶこと。`grep -n '"deploy"' package.json` が 0 件

## 2. staging の資源

- [ ] 2.1 D1 `remoru-db-staging` を作り、id を 1.2・1.3 に書く。`wrangler d1 migrations apply remoru-db-staging --env staging --remote` を当てる
- [ ] 2.2 staging の VAPID 鍵を生成し、本体と cron の staging にシークレットを入れる（design D5）。
      Clerk の 2 つも入れる。`ANTHROPIC_API_KEY` は入れない
- [ ] 2.3 `npx wrangler secret list --env staging` を**両方の worker で**取り、`docs/deploy.md` の表に staging の列を足す

## 3. staging へ出す

- [ ] 3.1 `npm run deploy:staging` と `npm run deploy:staging:cron` を打つ。両方成功
- [ ] 3.2 `curl` で `/`（307）`/sign-in`（200）`/api/memos`（401）を staging で確かめる（`docs/deploy.md` の確認節と同じ）
- [ ] 3.3 staging の URL でサインインし、メモ投入 → 一覧 → 詳細を通す。**Clerk が origin を拒んだら**
      ダッシュボードで許可し、そのことを `docs/deploy.md` に書く
- [ ] 3.4 iPhone で staging を PWA としてホーム画面に追加し、開けることを利用者に確かめてもらう（L10）

## 4. 本番を CI に移す

- [ ] 4.1 Cloudflare で Workers と D1 の編集権限だけのトークンを作り、GitHub の secret に
      `CLOUDFLARE_API_TOKEN` `CLOUDFLARE_ACCOUNT_ID` を入れる（**人が行う**。エージェントはトークンを見ない）
- [ ] 4.2 `.github/workflows/deploy.yml` を書く（design D4）。`main` への push だけで走ること
- [ ] 4.3 ブランチに push して `deploy.yml` が**走らない**ことを Actions の一覧で確かめる（L06 の逆: 走ってはいけない条件で走らない）
- [ ] 4.4 手元から `deploy:production` で本番を最新にしてから `main` に merge し、CI の配備が緑で終わること、
      本番の `curl` 確認が変わらないことを見る

## 5. 手順書と規則

- [ ] 5.1 `docs/deploy.md` を書き直す。「エージェントの経路（staging）」「CI の経路（本番）」「人が打つ操作（本番 D1）」の 3 節に分ける（design D6）
- [ ] 5.2 `CLAUDE.md` に「本番の配備と D1 はエージェントが触らない。staging まで」の 1 行を足す
- [ ] 5.3 記憶（auto-memory）の「修正後はデプロイまで済ませる」の行き先を staging に更新するよう、完了報告に書く
- [ ] 5.4 `npm run harness:review` で受領書を作り、コミットの門を通す
