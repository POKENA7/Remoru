## Why

本番への出荷経路が 1 本しかなく、**それをエージェントが手元から直接叩いている**
（`npm run deploy`）。本番の D1 にも `wrangler d1 execute --remote` で触れる。
`docs/open-issues.md` の 1 は本番の行を手で消して対処しており、これは今後も起きる。

これから `app/` のほぼ全域を書き換える change が続く（`docs/nextjs-rework-plan.md`）。
実機の iPhone で確かめるには出荷が要るが、確かめる前のものを本番に出したくない。
`server-side-reads` の design は「タブ切替の体感は実測してから判断する」と書いており、
**その実測の場所が本番しか無い**のが問題である。

利用者は 2026-09-12 に staging を作ることを承認した。

## What Changes

- **staging を作る。** 本体 `remoru-staging` と通知 `remoru-cron-staging` の 2 worker、
  本番とは別の D1 `remoru-db-staging`。`wrangler.jsonc` の `env.staging` で定義する
- **エージェントが出せるのは staging まで。** `npm run deploy:staging` を用意し、
  `docs/deploy.md` と `CLAUDE.md` から本番への手順を外す
- **本番へは CI だけが出す。** `main` への push を契機に GitHub Actions が `check` →
  マイグレーション → 2 worker の配備を行う。Cloudflare の API トークンは GitHub の secret
- **本番 D1 への直接操作は人の手順にする。** `docs/deploy.md` に「人が打つ」と明記する
- iPhone での確認は staging の URL で行う。記憶「修正後はデプロイまで済ませる」の
  行き先が staging になる

### Non-goals

- Clerk の本番インスタンスへの移行。開発インスタンスを本番・staging で共用したまま
- 本番データの staging への複製。staging は空から始める
- プレビュー URL（ブランチごとの使い捨て環境）。staging 1 本で足りる規模

## Capabilities

### New Capabilities

なし。運用の変更であり、製品の振る舞いは変わらない。`skip_specs: true`。

### Modified Capabilities

なし。

## Impact

| 対象 | 変更 |
|---|---|
| Cloudflare | worker 2 本、D1 1 本、シークレット一式（staging 用の VAPID 鍵を含む）を追加 |
| GitHub | `CLOUDFLARE_API_TOKEN` `CLOUDFLARE_ACCOUNT_ID` を secret に追加。`deploy.yml` を新設 |
| 変更 | `wrangler.jsonc`, `cron-worker/wrangler.jsonc`, `package.json`（`deploy` → `deploy:staging` / `deploy:production`）, `docs/deploy.md`, `CLAUDE.md`, `.github/workflows/deploy.yml` |
| 製品コード | 触らない |
| 費用 | 無料枠の範囲 |
