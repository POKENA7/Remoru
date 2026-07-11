# Remoru

忘却曲線 (SM-2 アルゴリズム) に基づいてメモの内容をクイズ形式で復習させる PWA。

## 構成

- `remoru/` — Next.js (App Router) + Cloudflare Workers (OpenNext) + D1 + Clerk 認証。メイン Web アプリ。
- `cron-worker/` — 独立した Cloudflare Worker。1時間おきに全ユーザーの通知時刻をチェックし、該当ユーザーがいれば `remoru-web` の `POST /api/internal/send-push` を呼び出す。

## セットアップ (ローカル開発)

`remoru/` ディレクトリで:

1. `npm install`
2. `npx wrangler d1 create remoru-db` → 出力された `database_id` を `wrangler.jsonc` の `d1_databases[0].database_id` に反映 (`cron-worker/wrangler.jsonc` にも同じ値を反映する)
3. `npx drizzle-kit generate && npx wrangler d1 migrations apply remoru-db --local`
4. `.dev.vars.example` を `.dev.vars` にコピーし、Clerk / VAPID / `INTERNAL_SECRET` の値を設定する
   - Clerk: https://dashboard.clerk.com の API Keys から取得
   - VAPID: `npx web-push generate-vapid-keys` で生成
   - `INTERNAL_SECRET`: `openssl rand -hex 32` などで生成したランダム文字列
5. `npm run dev` でローカル開発、`npm run preview` で Cloudflare Workers ランタイムでの動作確認

`cron-worker/` ディレクトリで:

1. `npm install`
2. `wrangler.jsonc` の `d1_databases[0].database_id` を上記と同じ値に、`vars.INTERNAL_API_URL` をローカル/デプロイ先の `remoru-web` の URL に設定
3. ローカルで動作確認する場合は `npx wrangler d1 migrations apply remoru-db --local` (remoru と同じ DB を参照するため remoru 側で一度適用していれば不要な場合が多い)

## テスト

```bash
cd remoru && npx vitest run        # 40 tests (sm2, test-db, users, memos, review, notifications, push)
cd cron-worker && npx vitest run   # 4 tests (getLocalHour, runDigest)
```

いずれも `npm run build` (remoru) / `npx tsc --noEmit` (cron-worker) で型チェック・ビルドが通ることを確認する。

## デプロイ

`remoru/` で:

1. `npx wrangler d1 migrations apply remoru-db --remote`
2. 本番用シークレットを設定 (`.dev.vars` の値を Cloudflare 側にも登録):
   ```bash
   npx wrangler secret put CLERK_SECRET_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put INTERNAL_SECRET
   ```
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` はクライアントに公開される値のため `wrangler.jsonc` の `vars` に設定してもよい。
3. `npm run deploy`

`cron-worker/` で:

1. `wrangler.jsonc` の `vars.INTERNAL_API_URL` を、上記でデプロイした `remoru-web` の本番 URL に更新
2. `npx wrangler secret put INTERNAL_SECRET` — `remoru/` に設定したものと **同じ値** を設定する
3. `npx wrangler deploy`

> **重要:** ローカル開発用の `.dev.vars` にはプレースホルダーの Clerk キー (`pk_test_replace_me` / `sk_test_replace_me`) が入っている前提で開発を進めてきたため、実際のサインイン動作 (`npm run preview` での手動確認や本番デプロイ) には実際の Clerk キーへの差し替えが必須。プレースホルダーのままでは全ページが HTTP 500 を返す。

## Push通知 / Cron の手動確認手順

Push 通知とスケジュール実行は自動テストが困難な領域のため、以下の手順で手動確認する:

1. ブラウザで `remoru-web` のプレビュー/本番 URL を開き、サインインする
2. ブラウザの通知許可ダイアログを許可し、`/api/push/subscribe` に購読情報が POST されることを devtools の Network タブで確認
3. `npx wrangler d1 execute remoru-db --local --command "UPDATE review_cards SET due_date = 0"` で全カードを「復習期限切れ」にする
4. `cron-worker` を `npx wrangler dev --test-scheduled` で起動し、別ターミナルで `curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"` を実行
5. ブラウザ側に Push 通知が届き、タップすると `/review` に遷移して当日分のキューが表示されることを確認

## 既知の制約

- クイズの AI モードは Cloudflare Workers AI (`AI` バインディング) を使用するため、ローカルでは `wrangler dev --remote` 相当の設定 (もしくは実際のデプロイ環境) でのみ完全に動作する。
- 通知のタイムゾーン処理は不正な IANA タイムゾーン文字列を検知して該当ユーザーのみスキップするよう防御的に実装されている (`/settings` の保存時にも同様のバリデーションあり) が、`users.timezone` を直接 DB操作で不正な値に書き換えた場合はこの限りではない。
