# デプロイ手順

本番: https://remoru.pokena191.workers.dev

## 通常のデプロイ

```bash
npm run deploy
```

`predeploy` がテストと型チェックを走らせ、**落ちたらデプロイに進まない**。
先行実装のデプロイはビルドと出荷だけで、赤いまま出荷できた。同じ形にしない。

## 初回だけ必要だったこと

すでに済んでいる。作り直すときのために残す。

1. **D1 の用意** — `remoru-db`（`5c1baf13-12a8-4e74-ad65-34a93d13a75f`）。
   `wrangler.jsonc` の `database_id` に反映済み
   ```bash
   npx wrangler d1 migrations apply remoru-db --remote
   ```
2. **シークレットの登録** — 値は `.env.local` にある。リポジトリには入れない
   ```bash
   npx wrangler secret put CLERK_SECRET_KEY
   npx wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   ```

## 踏んだ罠

**この2つはローカルの `next dev` では起きない。** Workers ランタイムで初めて出る。

### 1. `proxy.ts` ではビルドが通らない

```
ERROR Node.js middleware is not currently supported.
```

Next.js 16 は `middleware.ts` を `proxy.ts` に改名し、**Node.js ランタイム固定**にした（設定不可）。OpenNext は Node.js ランタイムの middleware を支援しない。

`clerk init` は Next.js 16 の慣習に従って `proxy.ts` を作るので、**そのままでは Cloudflare にデプロイできない**。`middleware.ts` に置き換える。Edge で動くのでビルドが通る。

Next.js 16 のアップグレード文書に明記されている。

> The `edge` runtime is NOT supported in `proxy`. ... If you want to continue using the `edge` runtime, keep using `middleware`.

### 2. middleware を消すと本番が全ページ 500

```
Error: Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware().
```

Clerk の `auth()` は `clerkMiddleware()` が動いていることを前提にしている。保護を資源側に移しても、**文脈を用意するための middleware は要る**。

いまの構成:

| 層 | 役割 |
|---|---|
| `middleware.ts` | Clerk の文脈を用意するだけ。保護は担わない |
| `app/page.tsx` | サーバー側で確認し、未認証なら `/sign-in` へ |
| API ルート | 各自が `getCurrentUserId()` を確認し、未認証なら 401 |

保護を資源側に置いたのは Clerk の推奨でもある（`createRouteMatcher` の非推奨理由: パス一致は Next.js のルーティングと乖離しうる）。

## 確認

デプロイ後、次が期待どおりか見る。

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://remoru.pokena191.workers.dev/          # 307
curl -s -o /dev/null -w "%{http_code}\n" https://remoru.pokena191.workers.dev/sign-in   # 200
curl -s https://remoru.pokena191.workers.dev/api/memos                                  # 401
```

**500 が返るならシークレットが効いていない。** `npx wrangler secret list` で確認する。

最後に本番の URL でサインインし、メモの投入から復習まで実際に通す。
ここまで通って初めてデプロイ完了とする。

## 既知の制約

- Clerk は**開発インスタンス**を使っている。サインイン画面に「Development mode」と出る。本番インスタンスに移すならダッシュボードで作成し、鍵を差し替える
- ローカルでは `npm run preview`（Workers ランタイム）を使っていない。`.env.local` は `next dev` にしか効かないため。Workers ランタイム固有の不具合は本番で初めて出る
