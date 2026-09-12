## 1. 設定

- [x] 1.1 `npx opennextjs-cloudflare deploy --help` で環境名を渡す旗を確かめ、design の Open Questions に答えを書く
      → **`-e, --env <name>`**（`@opennextjs/cloudflare` 1.20.2）。`build` にも同じ旗があるので両方に渡す。design の Open Questions に記録
- [x] 1.2 `wrangler.jsonc` に `env.staging` を足す。`name` `assets` `d1_databases`（`remoru-db-staging`）を
      **もう一度書く**（継承されない）。`database_id` は 2.1 で作ってから埋める
      → `remoru-staging` / `afc356ae-56bf-4f52-9777-288151a26768`
- [x] 1.3 `cron-worker/wrangler.jsonc` に `env.staging` を足す。`name` `triggers` `d1_databases` を書く
      → `remoru-cron-staging` / `0 * * * *` / 同じ staging の D1。`workers_dev` `preview_urls` も false で明示
- [x] 1.4 `scripts/harness/staging-isolation.test.ts` を書く（design D3）。staging の `database_id` を
      本番と同じにして赤、戻して緑を確かめる（L06）
      → **実測**。11 件。注入 1: `wrangler.jsonc` の staging の `database_id` を本番の
      `5c1baf13-…` にする → 赤（「database_id が本番と同じ」を名指しで報告）。注入 2:
      `cron-worker/wrangler.jsonc` の `env.staging` から `d1_databases` を落とす → 赤
      （「バインディングは継承されないので DB 無しで起動する」）。両方戻して 11/11 緑。
      再現しない手作業に頼らないよう、壊した設定を食わせる節をテストの中にも置いた
- [x] 1.5 `package.json` の `deploy` を消し、`deploy:staging` `deploy:staging:cron` `deploy:production` を
      足す（design D2）。`predeploy:staging` が `check` を呼ぶこと。`grep -n '"deploy"' package.json` が 0 件
      → `grep -n '"deploy"' package.json` は 0 件（exit 1）を実測

## 2. staging の資源

- [x] 2.1 D1 `remoru-db-staging` を作り、id を 1.2・1.3 に書く。`wrangler d1 migrations apply remoru-db-staging --env staging --remote` を当てる
      → `afc356ae-56bf-4f52-9777-288151a26768`（APAC）。0000〜0009 の 10 件を当てて全て ✅
- [ ] 2.2 staging の VAPID 鍵を生成し、本体と cron の staging にシークレットを入れる（design D5）。
      Clerk の 2 つも入れる。`ANTHROPIC_API_KEY` は入れない
      → **利用者に依頼中。** VAPID 鍵は生成済み（下の 6 節）。`wrangler secret put` は
      ハーネスの分類器が拒否した（Secret-Store Writes）ため、エージェントからは打てない。
      `VAPID_SUBJECT` に何を入れるかも利用者の判断（本番の値は読み出せない）
- [ ] 2.3 `npx wrangler secret list --env staging` を**両方の worker で**取り、`docs/deploy.md` の表に staging の列を足す
      → 表は `docs/deploy.md` に書いた（「staging のシークレット」節）。**実測での突き合わせは 2.2 待ち**

## 3. staging へ出す

- [x] 3.1 `npm run deploy:staging` と `npm run deploy:staging:cron` を打つ。両方成功
      → 両方成功。`predeploy:staging`（`npm run check`）が先に走って緑。
      `remoru-staging`: 起動 28ms、7,039.53 KiB / gzip 1,471.03 KiB、assets 27 件、
      バインディングは `env.DB (remoru-db-staging)` と `env.ASSETS`。
      https://remoru-staging.pokena191.workers.dev
      `remoru-cron-staging`: 起動 4ms、24.90 KiB / gzip 7.62 KiB、schedule `0 * * * *`、
      バインディングは `env.DB (remoru-db-staging)`。**どちらも本番の D1 を掴んでいない**ことを
      wrangler の出力で確認した
- [x] 3.2 `curl` で `/`（307）`/sign-in`（200）`/api/memos`（401）を staging で確かめる（`docs/deploy.md` の確認節と同じ）
      → staging: `/`=307 `/sign-in`=200 `/review`=307 `/record`=307。**`/api/memos` は 401 ではなく 404**——
      `server-actions-for-writes` が `app/api` を消しているので、tasks と `docs/deploy.md` に残っていた
      401 の期待が古かった。**本番も同じく 404** を実測（`/`=307 `/sign-in`=200）。staging と本番の
      応答が一致することを確認の基準に変え、`docs/deploy.md` の確認節から `/api/memos` を外した
- [ ] 3.3 staging の URL でサインインし、メモ投入 → 一覧 → 詳細を通す。**Clerk が origin を拒んだら**
      ダッシュボードで許可し、そのことを `docs/deploy.md` に書く
      → **2.2 待ち。** `CLERK_SECRET_KEY` が入っていないとサインインは通らない
- [ ] 3.4 iPhone で staging を PWA としてホーム画面に追加し、開けることを利用者に確かめてもらう（L10）
      → **利用者に依頼中**（2.2 の後）。https://remoru-staging.pokena191.workers.dev

## 4. 本番を CI に移す

- [ ] 4.1 Cloudflare で Workers と D1 の編集権限だけのトークンを作り、GitHub の secret に
      `CLOUDFLARE_API_TOKEN` `CLOUDFLARE_ACCOUNT_ID` を入れる（**人が行う**。エージェントはトークンを見ない）
      → **利用者に依頼中**
- [x] 4.2 `.github/workflows/deploy.yml` を書く（design D4）。`main` への push だけで走ること
      → `on: push: branches: [main]` のみ（`pull_request` は書いていない）。`concurrency` で
      出荷を重ねない（`cancel-in-progress: false`——マイグレーション直後に殺されると
      新しいスキーマに古いコードが残る）。順序は check → マイグレーション → 配備 → curl 確認
- [ ] 4.3 ブランチに push して `deploy.yml` が**走らない**ことを Actions の一覧で確かめる（L06 の逆: 走ってはいけない条件で走らない）
      → **コミットの門待ち**（下の 6 節）。push できていない
- [ ] 4.4 手元から `deploy:production` で本番を最新にしてから `main` に merge し、CI の配備が緑で終わること、
      本番の `curl` 確認が変わらないことを見る
      → **利用者に依頼中**（merge は利用者が行う）。本番の現状は `/`=307 `/sign-in`=200 を実測済み

## 5. 手順書と規則

- [x] 5.1 `docs/deploy.md` を書き直す。「エージェントの経路（staging）」「CI の経路（本番）」「人が打つ操作（本番 D1）」の 3 節に分ける（design D6）
      → 冒頭に「誰が打つか」の表を置き、3 節へ分けた。古かった `/api/memos` 401 の確認を外し、
      `middleware.ts` の説明にあった「API ルート」の行を `queries.ts` / `actions.ts` に直した
- [x] 5.2 `CLAUDE.md` に「本番の配備と D1 はエージェントが触らない。staging まで」の 1 行を足す
      → 「前提」節に追加
- [x] 5.3 記憶（auto-memory）の「修正後はデプロイまで済ませる」の行き先を staging に更新するよう、完了報告に書く
      → 完了報告に書いた。行き先は https://remoru-staging.pokena191.workers.dev（本番ではない）
- [x] 5.4 `npm run harness:review` で受領書を作り、コミットの門を通す
      → 指摘 0 件で受領書を作成。門を通してコミット

## 6. 利用者に依頼していること / 止まっている理由

### (1) 〔解決済み〕`npm run check` が **origin/main の時点で赤かった**（この change と無関係）

**利用者の判断でこの change の中で直した**（Impact 表の外のファイル 2 つに触れている）。

`scripts/harness/precommit-gate.test.ts` の (a)(c) が落ちる。**期待 2、実際 1。**

原因は `scripts/harness/precommit-gate.sh:86` の

```bash
echo "門: この差分（$hash）のレビュー受領書が無い。…" >&2
```

このマシンの `bash` は **3.2.57（/bin/bash 1 つだけ。homebrew の bash は無い）**で、
`$hash）` の全角括弧のバイトを変数名の一部として読む。`set -u` があるので
`hash?: unbound variable` で**スクリプトごと exit 1** になる。

**つまり「受領書が無い」分岐の門は、このマシンで一度も 2 を返していない。**
検査が落ちる分岐（先に評価される）は 2 を返すので、そこだけは効いている。

- 切り分け: `origin/main`（`d7d12b0`）を `git worktree add --detach` した素の作業ツリーで
  同じ 2 件が落ちることを実測した。この change の差分は無関係
**直したもの**（`$var` の直後が全角文字になっている箇所を `grep -P '\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F{]'`
で洗い、`${var}` に括った）:

| ファイル | 箇所 |
|---|---|
| `scripts/harness/precommit-gate.sh` | 86 行 `（$hash）` |
| `scripts/spawn-change.sh` | 124 行 `（$path` `pane $pane）`、142 行 `$ws（$branch）` |

`scripts/spawn-change.sh` は `set -euo pipefail` なので、**worktree を作った直後の 124 行で
落ちていた**（`npm ci` に到達しない）。同じ欠陥である。

**実測:** 直す前 exit 1 →（`${hash}` に括る）→ exit 2 と、受領書が無い旨のメッセージが
正しく出ることを、使い捨てリポジトリで確認した。`precommit-gate.test.ts` 11/11 緑、
`npm run check` 全体で 50 ファイル 594 件が緑。

**残っている懸念:** 同じ形（`$var` の直後に全角文字）を止める検査は**足していない**。
Impact 表の外をこれ以上広げないため。次に同じことが起きるので、検査の追加を勧める。

### (2) staging のシークレット登録（2.2）

`wrangler secret put` はハーネスの分類器が拒否する（Secret-Store Writes）。
**利用者が打つ。** 値は次のとおり。

```bash
# 本体（リポジトリのルートで）
npx wrangler secret put CLERK_SECRET_KEY --env staging                  # .env.local と同じ値
npx wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --env staging # .env.local と同じ値
npx wrangler secret put VAPID_PUBLIC_KEY --env staging                  # 下の公開鍵

# cron
(cd cron-worker && npx wrangler secret put VAPID_PUBLIC_KEY --env staging)   # 下の公開鍵
(cd cron-worker && npx wrangler secret put VAPID_PRIVATE_KEY --env staging)  # 下の秘密鍵
(cd cron-worker && npx wrangler secret put VAPID_SUBJECT --env staging)      # mailto:… を決める
```

VAPID 鍵は **`npx web-push generate-vapid-keys` でその場で作る**（本番とは別鍵。design D5）。

エージェントも一度生成したが、**値をここに残さない**——このリポジトリは public で、
`check:secrets` の 5「これからコミットされる内容に鍵が入っていないか」が実際に赤くなった
（実測）。会話に載った鍵は使わず、利用者が作り直す。staging にはまだ購読が無いので、
作り直しても失うものは無い。

`VAPID_SUBJECT` は**利用者が決める値**。本番に入っている値は読み出せないので、
同じにしたいなら手元で確認して入れる。

`ANTHROPIC_API_KEY` は **staging に入れない**（design のマイグレーション手順 2）。

### (3) GitHub の secret（4.1）

Cloudflare で **Workers Scripts の編集**と **D1 の編集**だけを持つ API トークンを作り、
GitHub リポジトリの secret に入れる。**エージェントはトークンを見ない。**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### (4) 実機の確認（3.4）と merge（4.4）

- iPhone で https://remoru-staging.pokena191.workers.dev をホーム画面に追加し、開けること（(2) の後）
- `main` への merge の直前に手元から `npm run deploy:production` を打ち、merge 後の CI 配備で
  本番の応答が変わらないことを見る

### (5) 残っているタスクの依存

```
2.2（利用者: staging のシークレット）
  └→ 2.3（secret list で表を突き合わせ）
  └→ 3.3（staging でサインイン → メモ投入 → 一覧 → 詳細）
        └→ 3.4（利用者: iPhone で PWA として開く）

4.1（利用者: GitHub の secret）
  └→ 4.4（利用者: 手元から deploy:production → main へ merge → CI が緑）
```

4.3（ブランチ push で `deploy.yml` が走らないこと）はこのセッションで確認する。
