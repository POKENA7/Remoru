## Context

**worker は 2 本**（`docs/deploy.md`）。本体 `remoru` は `.open-next/worker.js`、通知の
`remoru-cron` は `cron-worker/src/index.ts`。両方が同じ D1 `remoru-db` を読む。
共有コード（`features/notification/*` `features/review/review-scheduler`）を変えたら
両方出し直す必要がある。

**wrangler の名前付き環境はバインディングを継承しない。** `env.staging` を書くなら
`d1_databases` も `assets` も `triggers` も、その中にもう一度書く。書き忘れると
staging が本番の D1 を指す——これが最大の事故なので、検査で止める（D3）。

**OpenNext は環境名を wrangler に渡せる。** `@opennextjs/cloudflare` の `run-wrangler` は
`environment` を受け取る。CLI の旗の綴りは `npx opennextjs-cloudflare deploy --help` で
確かめる（未確認）。

**`next dev` は `.env.local` を読むが Workers は読まない。** シークレットは
`wrangler secret put --env staging` で環境ごとに入れる。

**Clerk は開発インスタンス**（`docs/deploy.md` 既知の制約）。本番の `workers.dev` で
動いているので、staging の `workers.dev` でも動くはずだが、確かめるまで分からない。

## Goals / Non-Goals

**Goals:**

- エージェントが本番に触れない状態を作る（配備・D1 とも）
- 実機での確認を本番より前に置く

**Non-Goals:**

- ブランチごとの環境。staging は 1 本
- 本番データの複製

## Decisions

### D1: 環境は `env.staging` 1 つ。既定（トップレベル）が本番

`wrangler.jsonc` のトップレベルを本番のまま残し、`env.staging` を足す。逆（既定を
staging にする）は、既存の手順書とダッシュボードの名前が全部ずれるので採らない。

```
remoru            本番     D1 remoru-db          （既存）
remoru-staging    staging  D1 remoru-db-staging  （新規）
remoru-cron          本番     Cron 毎時0分
remoru-cron-staging  staging  Cron 毎時0分（staging の D1 の購読者にだけ送る）
```

cron の staging も動かす。通知の変更を実機で確かめる場所が要るため。送る相手は
staging の D1 にいる購読者だけなので、本番の利用者には届かない。

### D2: script は 3 つ。`deploy` という名前は消す

| script | 何をするか | 誰が呼ぶか |
|---|---|---|
| `deploy:staging` | `check` → build → `deploy --env staging`（本体）| エージェント・人 |
| `deploy:staging:cron` | `(cd cron-worker && wrangler deploy --env staging)` | 同上 |
| `deploy:production` | 本体と cron を本番へ | **CI だけ**。手元で打てるが、打たない決まりを `CLAUDE.md` に書く |

`deploy` を残すと、どちらに出るのか名前から分からない。消して、既存の手順書を書き換える。

`predeploy` は `deploy:staging` にも効かせる（`predeploy:staging` として `check` を呼ぶ）。

### D3: staging が本番の D1 を指していないことを検査する

`scripts/harness/staging-isolation.test.ts`。`wrangler.jsonc` と `cron-worker/wrangler.jsonc` を
読み、`env.staging.d1_databases[].database_id` が**トップレベルの `database_id` と異なる**こと、
`env.staging` に `d1_databases` が**存在する**こと（継承されないので、無ければ本番を指すのでは
なく、バインディング無しで落ちる。どちらも駄目）を見る。

違反を注入して赤くなることを確かめる（L06）: staging の `database_id` を本番と同じにする。

### D4: 本番への配備は `main` への push で CI が行う

`.github/workflows/deploy.yml`。`ci.yml` とは別ファイル（`ci.yml` は「秘密情報を使わない」と
自分で書いている。混ぜない）。

```
on: push: branches: [main]
jobs: deploy
  needs: なし（check は同じジョブの中で先に走らせる。別ワークフローの完了を待つ仕組みは複雑）
  steps: checkout(fetch-depth 0) → setup-node → npm ci → Linux バイナリ（ci.yml と同じ）
       → npm run check → d1 migrations apply --remote（本番）→ deploy:production
```

`CLOUDFLARE_API_TOKEN` は Workers Scripts と D1 の編集権限だけを持つトークンを作る。
`CLOUDFLARE_ACCOUNT_ID` も secret。fork からの push は `main` に届かないので走らない。

**マイグレーションを CI で当てる**のは、当て忘れ（コードだけ出て 500）を防ぐため。
順序は マイグレーション → 配備（逆だと、新しいコードが古いスキーマを読む窓ができる）。

### D5: staging 用の VAPID 鍵は別に作る

購読は公開鍵に紐づく（`docs/deploy.md`）。本番の鍵を staging に入れると、同じ端末で
両方に購読したとき区別がつかない。別に作り、`docs/deploy.md` の表に staging の列を足す。

### D6: 本番 D1 への直接操作は手順書の「人が打つ」節に隔離する

`docs/deploy.md` に「本番のデータに触る操作」の節を作り、`wrangler d1 execute remoru-db --remote`
はそこにだけ書く。`CLAUDE.md` には「本番の D1 と配備はエージェントが行わない。staging まで」の
1 行。**技術的に打てなくする手段は無い**（wrangler のログインは人のもの）ので、規則と
手順書の隔離で止める。チェックリストの「破壊的操作に Human Approval」はこれで ✅ とする。

## Risks / Trade-offs

- **Clerk が staging の origin を拒む** → サインインを最初に試す（タスク 3.3）。拒まれたら
  ダッシュボードの許可オリジンに足す
- **`deploy.yml` が壊れていると本番に出せなくなる** → 手元の `deploy:production` は残す
  （D2）。緊急時は人が打ち、そのことを `.learnings` に残す（L12 と同じ扱い）
- **staging の cron が夜 21 時に staging の通知を送ってくる** → 利用者の端末に 2 通来る。
  staging で通知を確かめないときは staging の通知設定をオフにしておく。手順書に書く

## Migration Plan

1. Cloudflare 側で D1 `remoru-db-staging` を作り、id を `env.staging` に書く
2. staging のシークレット一式を入れる（Clerk 2 つ、VAPID、`ANTHROPIC_API_KEY` は**入れない**——
   staging で問答の生成は起きなくてよい。要るときだけ入れる）
3. `deploy:staging` を打ち、サインイン → メモ投入 → 一覧を通す
4. GitHub の secret を入れ、`deploy.yml` を `main` に merge する。**この merge 自体が最初の CI 配備になる。**
   直前に手元から本番を出しておき、CI の配備で何も変わらないことを確かめる

ロールバックは `deploy.yml` を消すだけ。staging の資源は残しても害がない。

## Open Questions

- `opennextjs-cloudflare deploy` に環境名を渡す旗の綴り（`--env` か `-e` か）。`--help` で確かめる
- Cloudflare Web Analytics（`measure-first-paint` D4）を staging にも入れるか。入れない（本番だけ）で始める
