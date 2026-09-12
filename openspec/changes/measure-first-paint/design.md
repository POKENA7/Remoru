## Context

**いま分かっている値**（2026-09-12、本番、curl 3 回）

| 対象 | 値 |
|---|---|
| `/` 未サインイン（307）TTFB | 0.53 / 0.53 / 0.99 秒 |
| `/sign-in` TTFB | 0.07 / 0.48 / 0.53 秒 |
| 自前 JS 11 チャンク gzip 合計 | 224 KB |
| `clerk.browser.js` / `@clerk/ui` gzip | 81 KB / 44 KB |
| Google Fonts CSS gzip（iPhone UA） | 87 KB、描画ブロック |

**分かっていないこと**: サインイン済みの `/` で一覧が読めるまでの時間。Cookie が要るので
curl では測れない。

**`next build` は転送量を出力しない。** Next 16 のビルド結果に First Load JS の列は無い
（実測）。代わりに `.next/build-manifest.json` の `rootMainFiles`（全経路共通 7 本）と
`.next/server/app/page_client-reference-manifest.js` が参照するチャンク（`/` 固有 8 本）が
ある。この 2 つの和集合を gzip して足すと、本番で測った 224 KB に一致するはずである。

**手元の `next build` は 2 秒台**（Turbopack、実測 0.8 秒 compile + 0.8 秒 TypeScript）。
検査に載せられる。

## Goals / Non-Goals

**Goals:**

- 「一覧が読めるまで」を**同じ手順で誰が測っても同じ定義になる**形にする
- 転送量の後退を機械が止める
- 基準値を残し、以後の change が比べられる

**Non-Goals:**

- 速くすること
- Lighthouse のスコア。指標は 3 つに絞る（下記 D1）

## Decisions

### D1: 指標は 3 つ。「一覧が読めるまで」は LCP で代用しない

| 指標 | 定義 | 取り方 |
|---|---|---|
| TTFB | HTML の最初のバイト | DevTools のネットワーク欄 |
| **一覧が読めるまで** | サインイン済みで `/` を開いてから、**一覧の最初のメモの本文が画面に描かれる**まで | DevTools の Performance トレースで該当要素の描画時刻を読む。LCP が一覧の要素であればその値でよいが、**LCP 要素が何かを毎回確かめる**（フォントの切り替えで LCP 要素が変わることがある） |
| タブ切替 | タブをタップしてから、切替先の中身が描かれるまで | Performance トレースでタップのイベントから描画まで。現状はクライアント状態の切替なので数十 ms のはず。**これが「現状と同等」の基準** |

転送量（gzip 合計）は指標ではなく**検査**にする（D3）。

### D2: 条件を固定する。ウォームとコールドを分けて取る

- 端末: 利用者の iPhone（PWA、ホーム画面から起動）と、Mac の Chrome DevTools（iPhone のビューポート、
  ネットワークは「Fast 4G」相当の絞り、CPU 4 倍遅延）。**両方取る。** 実機は真の値、DevTools は
  再現性のある比較用
- 回線: 実機は Wi‑Fi。DevTools は絞りの設定を `docs/perf.md` に書く
- 状態: **ウォーム**（一度開いて閉じ、再度開く）を主とする。コールド（Workers の起動を含む、
  10 分以上開いていない状態）は別の行に取る。目標の 1 秒は**ウォームに対して**適用する。
  コールドは記録するだけで、目標にしない（Workers の起動時間はアプリ側で制御できない）
- データ: 利用者の実データ（メモ数を記録に書く）
- 回数: 5 回。中央値と最大値を残す（L13）

### D3: `check:bundle` は build の生成物を読む。ネットワークに出ない

```
check:build   = next build
check:bundle  = node scripts/harness/bundle-budget.mjs
check         = … && check:build && check:bundle
```

`bundle-budget.mjs` は `.next/build-manifest.json` の `rootMainFiles` と
`page_client-reference-manifest.js` が参照する `static/chunks/*.js` の和集合を取り、
各ファイルを gzip して足す。`bundle-budget.json` の `"/"` の値を超えたら非ゼロ。
出力は「経路 / 実測 / 予算 / 差」の 1 行と、超えたときはチャンクごとの内訳。

**正解が分かっている。** 本番で測った 224 KB（2026-09-12）に ±5% で一致しなければ、
読んでいるファイルが違う。一致してから採用する。

予算の初期値は**実測 + 5%**。下げるのは速くする change の仕事（各 change が自分の成果分だけ下げる）。

`check:build` を足すと `precommit-gate` の所要が数秒延びる。許容する。
`next build` が `next-env.d.ts` や `.next/` を書き換えても差分は出ない（gitignore 済み。確かめる）。

### D4: 実利用者の値は Cloudflare Web Analytics で取る

Workers に組み込みの RUM は無い。Web Analytics のビーコン（`static.cloudflareinsights.com`）を
ルート layout の `<Script strategy="afterInteractive">` で入れる。Cookie を使わず、無料。
Core Web Vitals が実利用者の端末から集まる。

**検査の代わりではない。** 事後に「実際の利用者は何秒で見えているか」を見るためのもので、
change の前後比較には使わない（利用者が 1 人で回数が少なく、ばらつきが読めない）。

*採らなかった案*: `web-vitals` を入れて自前の Route Handler に送る。テーブルとエンドポイントが
増える。1 人の利用者のために持つものではない。

### D5: 手順書は `docs/perf.md`、記録も同じファイルに積む

記録の形:

```
| 日付 | change | 条件 | TTFB | 一覧が読めるまで | タブ切替 | JS gzip | メモ数 | 備考 |
```

1 change につき「前」「後」の 2 行。**前の行は、前の change の後の行と同じでなければならない**
（違えば、change 以外の何かが変わっている。それを備考に書く）。

## Risks / Trade-offs

- **Performance トレースの読み取りは人の目に頼る** → 手順書にスクリーンショットの取り方まで書く。
  Chrome DevTools の MCP（`web-perf` skill）が使えるなら、その手順も併記する
- **実機の値は利用者にしか取れない** → DevTools の値で change を判断し、実機は節目（B1+B3 の本番投入前、
  B5 の後）で取る。どちらの値を根拠にしたかを記録に書く
- **予算を実測 + 5% にすると、意図せず 4% 増えても通る** → 意図した後退は無い前提。
  各 change が下げるので、緩みは長く残らない

## Open Questions

- Cloudflare Web Analytics が `workers.dev` のサブドメインで有効にできるか（ダッシュボードでサイトを
  追加するとき、所有ドメインが要る可能性）。できなければ D4 を見送り、記録して終える
- タブ切替の「同等」を数値で言うなら何 ms までか。現状の実測を見てから利用者に聞く
