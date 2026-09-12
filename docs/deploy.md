# デプロイ手順

出荷の経路は**3 つに分かれている**。誰が打つかで分かれており、混ぜない
（add-staging-environment design D6）。

| 経路 | 相手 | 打つ人 | 節 |
|---|---|---|---|
| `npm run deploy:staging` | staging | **エージェント・人** | [エージェントの経路](#エージェントの経路-staging) |
| `main` への push | 本番 | **CI だけ** | [CI の経路](#ci-の経路-本番) |
| `wrangler d1 execute --remote` など | 本番のデータ | **人だけ** | [人が打つ操作](#人が打つ操作-本番のデータ) |

**エージェントが出せるのは staging まで。** 本番への配備と本番 D1 への操作は
エージェントが行わない。技術的に打てなくする手段は無い（wrangler のログインは
人のもの）ので、この文書の分け方と `CLAUDE.md` の 1 行で止めている。

## 環境

| 環境 | 本体 worker | cron worker | D1 | URL |
|---|---|---|---|---|
| 本番 | `remoru` | `remoru-cron` | `remoru-db`（`5c1baf13-…`） | https://remoru.pokena191.workers.dev |
| staging | `remoru-staging` | `remoru-cron-staging` | `remoru-db-staging`（`afc356ae-…`） | https://remoru-staging.pokena191.workers.dev |

staging は `wrangler.jsonc` / `cron-worker/wrangler.jsonc` の `env.staging` で定義してある。
**wrangler の名前付き環境はバインディングを継承しない**ので、`d1_databases` も `assets` も
`triggers` も `env.staging` の中にもう一度書いてある。書き忘れると staging が本番の D1 を
指すか、DB 無しで起動する。`scripts/harness/staging-isolation.test.ts` がここを見ている。

**worker は各環境で 2 本ある。** 片方だけ出荷すると壊れ方が分かりにくい。
`features/notification/*` と `features/review/review-scheduler` は**両方が読む共有コード**で、
片方だけ古いままだと、通知の判定と本体の出題対象が食い違い、「復習タブには出ているのに
通知が来ない」という形で静かに壊れる。**この壊れ方はエラーを出さない。**

## エージェントの経路: staging

```bash
npm run deploy:staging       # 本体。predeploy:staging が npm run check を先に走らせる
npm run deploy:staging:cron  # cron。共有コードを変えたら必ず両方
```

`predeploy:staging` がテストと型チェックを走らせ、**落ちたらデプロイに進まない**。
先行実装のデプロイはビルドと出荷だけで、赤いまま出荷できた。同じ形にしない。

`-e staging` は **build にも deploy にも渡している**（`package.json` を参照）。build の
段階で wrangler の設定を読むので、build を既定環境で行うと staging の設定が反映されない。

出したあと、次が期待どおりか見る。

```bash
base=https://remoru-staging.pokena191.workers.dev
curl -s -o /dev/null -w "%{http_code}\n" "$base/"         # 307（未サインインは /sign-in へ）
curl -s -o /dev/null -w "%{http_code}\n" "$base/sign-in"  # 200
```

**500 が返るならシークレットが効いていない。** `npx wrangler secret list --env staging` で確認する。

最後に staging の URL でサインインし、メモの投入から復習まで実際に通す。
**実機でしか分からないもの**（端末の許可、Service Worker の登録、指定時刻の着信、
タップして復習が開くこと）は、staging を iPhone のホーム画面に PWA として追加して
人に確かめてもらう。iOS は**ホーム画面に追加した PWA でしか通知が届かない**。

**staging の cron も毎時 0 分に起きる。** 送る相手は staging の D1 にいる購読者だけなので
本番の利用者には届かないが、**同じ端末で両方に購読すると通知が 2 通来る**。staging で
通知を確かめないときは、staging 側の通知設定をオフにしておく。

### staging のシークレット

| 鍵 | `remoru-staging` | `remoru-cron-staging` | 備考 |
|---|---|---|---|
| `CLERK_SECRET_KEY` | 要る | 不要 | 本番と**同じ開発インスタンス**を共用 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 要る | 不要 | 同上 |
| `VAPID_PUBLIC_KEY` | 要る | 要る | **本番とは別の鍵**（design D5） |
| `VAPID_PRIVATE_KEY` | 不要 | 要る | 同上 |
| `VAPID_SUBJECT` | 不要 | 要る | `mailto:` 形式 |
| `ANTHROPIC_API_KEY` | **入れない** | — | staging で問答の生成は起きなくてよい。要るときだけ入れる |

VAPID を本番と分けるのは、**購読が公開鍵に紐づく**ため。同じ鍵を使うと、同じ端末で
両方に購読したとき区別がつかない。

```bash
npx wrangler secret put CLERK_SECRET_KEY --env staging
npx wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --env staging
npx wrangler secret put VAPID_PUBLIC_KEY --env staging

(cd cron-worker && npx wrangler secret put VAPID_PUBLIC_KEY --env staging)
(cd cron-worker && npx wrangler secret put VAPID_PRIVATE_KEY --env staging)
(cd cron-worker && npx wrangler secret put VAPID_SUBJECT --env staging)
```

**`cd` は括弧で囲む。** どの worker を相手にしているかは**カレントディレクトリだけ**が
決めている。`cron-worker/wrangler.jsonc` には `migrations_dir` が無いため、そのまま次の
コマンドへ進むと `d1 migrations apply` が「No migrations present」で落ちる。

staging の D1 にマイグレーションを当てるのは**エージェントが行ってよい**。

```bash
npx wrangler d1 migrations apply remoru-db-staging --env staging --remote
```

## CI の経路: 本番

**本番へは `.github/workflows/deploy.yml` だけが出す。** `main` への push が契機。
手元から `npm run deploy:production` も打てるが、**打たない**（`deploy.yml` が壊れて
本番に出せないときの緊急路として残してある。使ったら `.learnings` に残す）。

CI が行う順序は決まっている。

```
npm ci → Linux 用ネイティブバイナリ → npm ci --prefix cron-worker
  → npm run check
  → wrangler d1 migrations apply remoru-db --remote     ← マイグレーションが先
  → npm run deploy:production                            ← 本体と cron の両方
  → curl で / と /sign-in を確認
```

**マイグレーションを先に当てる。** 逆にすると、新しいコードが古いスキーマを読む窓が
できる。CI に置いたのは、当て忘れ（コードだけ出て 500）を防ぐため。

必要な GitHub の secret は 2 つ。**人が入れる。**

| secret | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers Scripts と D1 の編集権限**だけ**を持つトークン |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID |

`ci.yml`（`check` だけを走らせるワークフロー）とは**別ファイル**にしてある。`ci.yml` は
「秘密情報は使わない。デプロイも載せない」と自分で書いており、混ぜるとその約束が静かに消える。

## 人が打つ操作: 本番のデータ

**この節のコマンドはエージェントが打たない。** 本番のデータを壊しうる操作をここに隔離してある。

```bash
# 本番の D1 を読む・書く
npx wrangler d1 execute remoru-db --remote --command "SELECT ..."

# 本番のマイグレーション（通常は CI が当てる。手で当てるのは CI が壊れているときだけ）
npx wrangler d1 migrations apply remoru-db --remote

# 本番のシークレット
npx wrangler secret put CLERK_SECRET_KEY
npx wrangler secret list
```

本番の状態を**読むだけ**の確認は次のとおり。

```bash
# 通知のテーブルがあるか
npx wrangler d1 execute remoru-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'notification%' OR name='push_subscriptions')"

# cron の Cron Trigger が登録されているか
(cd cron-worker && npx wrangler deployments list)
```

### 本番のシークレット

| 鍵 | `remoru`（本体） | `remoru-cron` |
|---|---|---|
| `CLERK_SECRET_KEY` | 要る | 不要 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 要る | 不要 |
| `VAPID_PUBLIC_KEY` | 要る（購読を作るときブラウザへ渡す） | 要る |
| `VAPID_PRIVATE_KEY` | 不要 | 要る |
| `VAPID_SUBJECT` | 不要 | 要る（`mailto:` 形式） |
| `ANTHROPIC_API_KEY` | 要る（問答の生成） | 不要 |

**片方だけに入れると、購読はできるのに通知が届かない。** 本体側の鍵だけあると購読は
作れてしまい、cron 側が署名できずに落ちる。画面上は成功に見えるので、
`npx wrangler secret list` を**両方で**確認する。

`VAPID_SUBJECT` は**取得するものではなく自分で決める値**。JWT の `sub` に載る連絡先で、
`mailto:...` か `https://...` のいずれか。配信元に問題があったときプッシュサービスから
連絡が来る先なので、実在するものにする。`mailto:` を付け忘れると署名を拒否する配信
サービスがある。秘密ではないが、**このリポジトリは public** なので `wrangler.jsonc` の
`vars` ではなくシークレットに置く。vars に書くとメールアドレスが GitHub に載る。

鍵を作るのは `npx web-push generate-vapid-keys`。**鍵を差し替えると購読も作り直しになる**
（購読は購読時の公開鍵に紐づくため、既存の購読先はすべて無効になる）。

### `ANTHROPIC_API_KEY` について

console.anthropic.com で発行する。**Claude Code の Pro プランとは別勘定**で、使った分だけ
課金される。事前にクレジットを入れておく必要がある。ID 連携（workload identity
federation）は GCP・AWS・Azure・GitHub Actions だけが対象で、**Cloudflare Workers は対象外**。

**鍵が無くてもアプリは壊れない。** 生成が起きず、書いたメモが「未作成」のまま残るだけに
なる（手で問と答を書けば復習に入る）。逆に言うと、鍵の入れ忘れや期限切れは**エラーとして
現れない**。生成されないメモが増えることでしか気づけないので、`wrangler secret list` で確認する。

利用回数の上限はアプリ側に無い（意図的な判断）。呼び出しが起きるのは次の 3 つで、
**どれも 1 回につき 1 呼び出し**。

| 経路 | 上限 |
|---|---|
| メモの保存 | 無し。ただしメモが 1 件増える |
| 問答の作り直し | **無し。同じメモに何度でも投げられる** |
| タグの提案 | **無し。ただし 1 回で渡すメモは 30 件まで** |

作り直しには「メモが増える」という抑えも無いので、認証さえ通れば同じメモに対して
繰り返し呼べる。公開サインアップなので、他人の利用がそのまま課金になる。**天井が要るなら
コンソール側の使用上限額で作る。** アプリのコードを変えずに済む。

## 踏んだ罠

**この 2 つはローカルの `next dev` では起きない。** Workers ランタイムで初めて出る。

### 1. `proxy.ts` ではビルドが通らない

```
ERROR Node.js middleware is not currently supported.
```

Next.js 16 は `middleware.ts` を `proxy.ts` に改名し、**Node.js ランタイム固定**にした
（設定不可）。OpenNext は Node.js ランタイムの middleware を支援しない。

`clerk init` は Next.js 16 の慣習に従って `proxy.ts` を作るので、**そのままでは Cloudflare に
デプロイできない**。`middleware.ts` に置き換える。Edge で動くのでビルドが通る。

Next.js 16 のアップグレード文書に明記されている。

> The `edge` runtime is NOT supported in `proxy`. ... If you want to continue using the `edge` runtime, keep using `middleware`.

### 2. middleware を消すと本番が全ページ 500

```
Error: Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware().
```

Clerk の `auth()` は `clerkMiddleware()` が動いていることを前提にしている。保護を資源側に
移しても、**文脈を用意するための middleware は要る**。

| 層 | 役割 |
|---|---|
| `middleware.ts` | Clerk の文脈を用意するだけ。保護は担わない |
| `features/*/queries.ts` | `verifySession()` で読み取りを守る |
| `features/*/actions.ts` | `verifySession()` で書き込みを守る |

保護を資源側に置いたのは Clerk の推奨でもある（`createRouteMatcher` の非推奨理由:
パス一致は Next.js のルーティングと乖離しうる）。

## 既知の制約

- Clerk は**開発インスタンス**を使っている。サインイン画面に「Development mode」と出る。
  本番と staging で**同じ開発インスタンスを共用**している。本番インスタンスに移すなら
  ダッシュボードで作成し、鍵を差し替える
- staging に本番のデータは複製していない。**staging は空から始まる**
- ブランチごとの使い捨て環境（プレビュー URL）は作っていない。staging 1 本
- ローカルでは `npm run preview`（Workers ランタイム）を使っていない。`.env.local` は
  `next dev` にしか効かないため。Workers ランタイム固有の不具合は staging で初めて出る
- `app/api` は無い（`server-actions-for-writes` で削除した）。読み取りは Server Components、
  書き込みは Server Actions。**以前この文書にあった `/api/memos` が 401 を返す確認は、
  いま 404 を返す**ので確認から外した
