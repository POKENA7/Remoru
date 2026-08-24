# デプロイ手順

本番: https://remoru.pokena191.workers.dev

**worker は2つある。** 片方だけ出荷すると壊れ方が分かりにくいので、
どちらの手順もこの文書に置く。

| worker | 出すもの | 手順 |
|---|---|---|
| `remoru` | 本体アプリ | `npm run deploy` |
| `remoru-cron` | 通知の cron | `(cd cron-worker && npx wrangler deploy)` |

## 通常のデプロイ

```bash
npm run deploy
```

`predeploy` がテストと型チェックを走らせ、**落ちたらデプロイに進まない**。
先行実装のデプロイはビルドと出荷だけで、赤いまま出荷できた。同じ形にしない。

cron worker を変えたときは、そちらも出す。

```bash
(cd cron-worker && npx wrangler deploy)
```

**`cd` は括弧で囲む。** `cron-worker/wrangler.jsonc` には `migrations_dir` が
無いため、そのまま次のコマンドへ進むと `d1 migrations apply` が
「No migrations present at .../cron-worker/migrations」で落ちる。
どの worker を相手にしているかは**カレントディレクトリだけ**が決めている。

**`cron-worker/` は本体のテストとは別の worker だが、コードは共有している**
（`lib/notification-timing.ts`、`lib/push.ts`、`lib/review-scheduler.ts`）。
共有ファイルを変えたら**両方を出し直す**。片方だけ古いままだと、通知の
判定と本体の出題対象が食い違い、「復習タブには出ているのに通知が来ない」
という形で静かに壊れる。**この壊れ方はエラーを出さない。**

## 初回だけ必要だったこと

すでに済んでいる。作り直すときのために残す。

1. **D1 の用意** — `remoru-db`（`5c1baf13-12a8-4e74-ad65-34a93d13a75f`）。
   `wrangler.jsonc` の `database_id` に反映済み
   ```bash
   npx wrangler d1 migrations apply remoru-db --remote
   ```

   **リポジトリのルートで実行する。**
2. **シークレットの登録** — 値は `.env.local` にある。リポジトリには入れない
   ```bash
   npx wrangler secret put CLERK_SECRET_KEY
   npx wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   ```
3. **VAPID の鍵**（通知）— 生成して**両方の worker**に登録する
   ```bash
   npx web-push generate-vapid-keys
   ```

   | 鍵 | `remoru`（本体） | `remoru-cron` |
   |---|---|---|
   | `VAPID_PUBLIC_KEY` | 要る（購読を作るときブラウザへ渡す） | 要る |
   | `VAPID_PRIVATE_KEY` | 不要 | 要る |
   | `VAPID_SUBJECT` | 不要 | 要る（`mailto:` 形式） |

   `VAPID_SUBJECT` は**取得するものではなく自分で決める値**。JWT の `sub` に
   載る連絡先で、`mailto:...` か `https://...` のいずれか。配信元に問題が
   あったときプッシュサービスから連絡が来る先なので、実在するものにする。
   `mailto:` を付け忘れると署名を拒否する配信サービスがある。

   秘密ではないが、**このリポジトリは public** なので `wrangler.jsonc` の
   `vars` ではなくシークレットに置く。vars に書くとメールアドレスが GitHub に
   載る。

   ```bash
   npx wrangler secret put VAPID_PUBLIC_KEY
   ```

   ```bash
   (cd cron-worker && npx wrangler secret put VAPID_PUBLIC_KEY)
   (cd cron-worker && npx wrangler secret put VAPID_PRIVATE_KEY)
   (cd cron-worker && npx wrangler secret put VAPID_SUBJECT)
   ```

   **片方だけに入れると、購読はできるのに通知が届かない。** 本体側の鍵だけ
   あると購読は作れてしまい、cron 側が署名できずに落ちる。画面上は成功に
   見えるので、`npx wrangler secret list` を**両方で**確認する。

4. **Anthropic の API キー**（問答の生成）— 本体 worker だけに要る
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

   console.anthropic.com で発行する。**Claude Code の Pro プランとは別勘定**で、
   使った分だけ課金される。事前にクレジットを入れておく必要がある。

   ID 連携（workload identity federation）は GCP・AWS・Azure・GitHub Actions
   だけが対象で、**Cloudflare Workers は対象外**。API キーを使う。

   **鍵が無くてもアプリは壊れない。** 生成が起きず、書いたメモが「未作成」の
   まま残るだけになる（手で問と答を書けば復習に入る）。逆に言うと、鍵の
   入れ忘れや期限切れは**エラーとして現れない**。生成されないメモが増える
   ことでしか気づけないので、`wrangler secret list` で確認する。

   利用回数の上限はアプリ側に無い（意図的な判断）。呼び出しが起きるのは
   次の2つで、**どちらも1回につき1呼び出し**。

   | 経路 | 上限 |
   |---|---|
   | メモの保存 | 無し。ただしメモが1件増える |
   | 問答の作り直し（`PUT /api/memos/{id}/quiz-item`） | **無し。同じメモに何度でも投げられる** |

   作り直しには「メモが増える」という抑えも無いので、認証さえ通れば同じ
   メモに対して繰り返し呼べる。公開サインアップなので、他人の利用が
   そのまま課金になる。**天井が要るならコンソール側の使用上限額で作る。**
   アプリのコードを変えずに済む。

   鍵を後から差し替えるときは、**購読も作り直しになる**。購読は購読時の
   公開鍵に紐づくため、鍵を変えると既存の購読先はすべて無効になる。

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

通知まわりは次も見る。

```bash
# 本番の D1 に2つのテーブルがあるか
npx wrangler d1 execute remoru-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'notification%' OR name='push_subscriptions'"

# cron の Cron Trigger が登録されているか
(cd cron-worker && npx wrangler deployments list)
```

**実際に届くかは実機でしか確かめられない。** 端末の許可、Service Worker の
登録、指定時刻の着信、タップして復習が開くこと。iOS は**ホーム画面に追加した
PWA でしか届かない**（ブラウザのタブでは届かない）。

最後に本番の URL でサインインし、メモの投入から復習まで実際に通す。
ここまで通って初めてデプロイ完了とする。

## 既知の制約

- Clerk は**開発インスタンス**を使っている。サインイン画面に「Development mode」と出る。本番インスタンスに移すならダッシュボードで作成し、鍵を差し替える
- ローカルでは `npm run preview`（Workers ランタイム）を使っていない。`.env.local` は `next dev` にしか効かないため。Workers ランタイム固有の不具合は本番で初めて出る
