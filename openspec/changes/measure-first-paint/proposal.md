## Why

これから初期表示を速くする change を 4 つ以上積む（`docs/nextjs-rework-plan.md`）。
しかし**サインイン済みの利用者が一覧を読めるまでの時間は、一度も測られていない**。
測ったのは未サインインの `/`（307）と `/sign-in` の TTFB、それに `next build` の
チャンク**合計**（4 経路ぶんを足した値。`server-actions-for-writes` design「実測」）だけで、
どれも利用者 1 人が一覧を見るまでの値ではない。

L04 と L13 は、測らずに「効いた」と主張して覆った出来事を 2 度記録している。
再発を規則で防ぐのはやめ、**検査と手順で防ぐ**。以後の change は全部、ここで決めた
同じ手順で前後を比べ、差がばらつきに埋もれたら入れない。

目標値は 2026-09-12 に利用者が決めた。**一覧が読めるまで 1 秒。タブの切り替えは
現状と同等**（現状で満足している。悪化させない）。「現状と同等」と言うには、
現状のタブ切替の値も要る。

## What Changes

- **計測の手順書** `docs/perf.md` を作る。対象・端末・条件・指標・回数・記録の形を固定する
- **基準値を取る。** 本番のサインイン済み `/` を iPhone 実機と Chrome DevTools で測り、
  `docs/perf.md` に残す。タブ切替の時間も取る
- **`check:build` と `check:bundle` を足す。** `next build` を検査に載せ、`/` のクライアント JS
  の gzip 合計を予算ファイルと比べる。予算超過で赤。`npm run check` と CI に入る
- **実利用者の Core Web Vitals を取り続ける。** Cloudflare Web Analytics のビーコンをルート
  layout に置く（Cookie 不要・無料）
- 目標値を `performance` capability の spec として残す

### Non-goals

- 速くすること。この change は物差しを作るだけで、製品の速度は変えない
- `next build` の警告（`middleware` の非推奨）を直すこと。`docs/open-issues.md` に載せてある

## Capabilities

### New Capabilities

- `performance`: 初期表示とタブ切替の速さの要件。いまの spec 群は速さについて何も
  言っておらず、目標値を置く場所が無い

### Modified Capabilities

なし。

## Impact

| 対象 | 変更 |
|---|---|
| 新規 | `docs/perf.md`, `scripts/harness/bundle-budget.mjs`, `scripts/harness/bundle-budget.json`, `scripts/harness/bundle-budget.test.ts` |
| 変更 | `package.json`（`check:build` `check:bundle` を `check` に追加）, `app/layout.tsx`（ビーコン 1 行）, `.github/workflows/ci.yml`（`check` に含まれるので変更不要のはず。確かめる） |
| 変更（実装中に追加） | `scripts/harness/precommit-gate.sh`, `scripts/harness/precommit-gate.test.ts`, `scripts/spawn-change.sh` — 門が macOS で exit 1 になり**ブロックしていなかった**穴。利用者判断（2026-09-12）でこの change に含めた。経緯は design「実装中に見つけたこと」 |
| 製品コード | ビーコンの `<script>` 1 本のみ |
| 依存 | 増えない |
