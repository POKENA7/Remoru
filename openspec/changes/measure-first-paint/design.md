## Context

**いま分かっている値**（2026-09-12、本番、curl 3 回）

| 対象 | 値 |
|---|---|
| `/` 未サインイン（307）TTFB | 0.53 / 0.53 / 0.99 秒 |
| `/sign-in` TTFB | 0.07 / 0.48 / 0.53 秒 |
| 自前 JS 11 チャンク gzip 合計 | 224 KB |
| `clerk.browser.js` / `@clerk/ui` gzip | 81 KB / 44 KB |
| Google Fonts CSS gzip（iPhone UA） | 87 KB、描画ブロック |

> **実装で分かったこと（2026-09-12）。この表の「224 KB」は `/` の値ではない。**
> 本番の HTML を取って数え直したところ、224 KB は **`/sign-in` の 11 チャンク**
> （実取得の合計 223,559 B）で、しかも `<script noModule>` が付いた polyfill
> 38.6 KB を含んでいた。**現代のブラウザはこれをダウンロードしない。**
> `/` の実際の値は **206.2 KB / 13 チャンク**（polyfill を除く）。
> 以後この表を引くときは、224 は `/sign-in`、206.2 が `/` である。

**分かっていないこと**: サインイン済みの `/` で一覧が読めるまでの時間。Cookie が要るので
curl では測れない。

**`next build` は転送量を出力しない。** Next 16 のビルド結果に First Load JS の列は無い
（実測）。`server-side-reads` と `server-actions-for-writes` は `.next/static/chunks/*.js` の
**合計**（773.6 → 827.0 KB、次いで 827.4 → 827.7 KB。raw。間の 827.0 → 827.4 は別の change の差分）で比べ、「経路ごとの内訳は取れなかった」と design に
書いている。**合計は利用者 1 人が読む量ではない**（4 経路ぶん）。この change はその欠落を埋める。代わりに `.next/build-manifest.json` の `rootMainFiles`（全経路共通 7 本）と
`.next/server/app/page_client-reference-manifest.js` が参照するチャンク（`/` 固有 8 本）が
ある。この 2 つの和集合を gzip して足すと、本番で測った 224 KB に一致するはずである。

**手元の `next build` は 2 秒台**（Turbopack、実測 0.8 秒 compile + 0.8 秒 TypeScript）。
検査に載せられる。

> **実装で分かったこと。この 2 秒台は compile と型検査の内訳であって、
> `next build` の所要ではない。** 壁時計で測ると、キャッシュが温まった状態でも
> **31.5 秒**、冷えていれば 32 秒（2026-09-12、手元の Mac）。`npm run check` 全体は
> 3 分 13 秒になった。D3 の「`precommit-gate` の所要が数秒延びる。許容する」は
> **30 秒延びる**が正しい。それでも許容する判断は変えない——コミット 1 回あたりの
> 話であり、転送量の後退を人が気づく経路が他に無い。

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

> **この検算は成立しなかった。突き合わせる相手を取り違えていた**（2026-09-12、実装）。
> 224 KB は `/` ではなく **`/sign-in`** の値で、さらに `noModule` の polyfill を含んでいた。
> `/` を D3 の式で計算すると 206.2 KB になり、±5%（212.8〜235.2 KB）に入らない。
> **式が違うのではなく、正解が `/` の値ではなかった。**
>
> **代わりに、同じ式を `/sign-in` に当てて本番と突き合わせた。** 本番の HTML が挙げる
> 11 本を実際に取得した合計 **223,559 B** に対し、ローカルのビルドから計算した値
> （`rootMainFiles` + `polyfillFiles` + client manifest）が **223,565 B**。**差 6 バイト。**
> 読む場所が違えば、この一致は起きない。検算としてはこちらの方が強い（経路 1 つぶんを
> 1 バイト単位で突き合わせている）。
>
> **予算からは `polyfillFiles` を外す**（利用者判断、2026-09-12）。本番の `<script>` に
> `noModule` が付いており、現代のブラウザは 38.6 KB を読まない。spec が縛るのは
> 「`/` を開くために読み込む」量なので、読まれないものを入れると予算が実態から離れる。
> `bundle-budget.test.ts` は「polyfill を足したら赤くなる」ことも見ている。

予算の初期値は**実測 + 5%**。下げるのは速くする change の仕事（各 change が自分の成果分だけ下げる）。
`/` の実測 206,221 B に対し、予算は **216,533 B**。

`check:build` を足すと `precommit-gate` の所要が数秒延びる。許容する。
`next build` が `next-env.d.ts` や `.next/` を書き換えても差分は出ない（gitignore 済み。確かめる）。

> **確かめた。** `next build` のあとの `git status --porcelain` に `.next/` と
> `next-env.d.ts` は現れない（前者は `.gitignore`、後者は追跡済みで中身が変わらない）。
> 所要は上記のとおり「数秒」ではなく 30 秒。

**この検査が見ないもの**（利用者判断、2026-09-12: 限界として記録するだけにする）。
Clerk の `clerk.browser.js`（81 KB）と `@clerk/ui`（44 KB）、Google Fonts の CSS（87 KB）は
別オリジンの CDN から来るのでビルドの生成物に現れない。**B1（lighten-first-paint）の成果は
この検査では捕まらない。** 外部スクリプトまで数えると本番の HTML を取りに行くことになり、
D3 の「ネットワークに出ない」を捨てることになるので採らない。`docs/perf.md` §6 に
「`check:bundle` が緑でも初期表示が速いとは限らない」と明記した。

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

## 実装中に見つけたこと

### 門が 8 日間ずっと開いていた（macOS のみ）

`scripts/harness/precommit-gate.sh:86` の「受領書が無い」の文言が
`この差分（$hash）の…` と書かれていた。**macOS の bash 3.2 は UTF-8 ロケールだと
全角の閉じ括弧の先頭バイト（0xEF）を変数名に取り込み**、`hash\xef` を未定義として
`set -u` で **exit 1** にする。PreToolUse の hook は **exit 2 でなければブロックしない**。
つまり受領書が無いコミットは、手元では**すべて素通りしていた**。

`precommit-gate.test.ts` の (a)(c) はこれを正しく赤くしていたが、**CI（Linux）では緑**だった。

**どこで壊れるかを実測した**（2026-09-12、同じ 1 行を各環境で走らせた）。

| 環境 | C | C.UTF-8 | en_US.UTF-8 | ja_JP.UTF-8 |
|---|---|---|---|---|
| macOS bash 3.2 | 正常 | — | **壊れる** | **壊れる** |
| Linux bash 5.2 / glibc 2.36 | 正常 | 正常 | 正常 | 正常 |
| Linux bash 5.2 / musl | 正常 | 正常 | 正常 | 正常 |

**bash の版ではなく macOS の libc の問題である。** UTF-8 ロケールで `isalnum()` が
0x80 以上のバイトを英数字として返すため、bash が変数名に取り込む。glibc と musl は返さない。

L07 の「環境を 1 つしか動かしていない間は、その差は存在しないのと同じに見える」が
**逆向き**に出た。CI を足したことで、手元だけが赤く CI は緑という状態になり、
**鳴っている方が間違っていると読まれた。** 検査は 8 日間ずっと正しく鳴っていた。

直したのは 3 か所（`${var}` にしただけ）。`precommit-gate.sh` 1 か所と
`spawn-change.sh` 2 か所。同じ形を `scripts/**/*.sh` 全体で走査して他に無いことを確かめた。

**検査に載せた。** `precommit-gate.test.ts` に、`LANG` を `C` / `en_US.UTF-8` /
`ja_JP.UTF-8` に固定して「受領書が無ければ 2」を見る 3 件を足した。直しを元に戻すと
UTF-8 の 2 件が赤くなり `C` の 1 件は緑のままであることを確かめてある（L06）。

**ただしこの 3 件は CI では常に緑で、何も守らない**（上の表のとおり Linux では再現しない）。
守るのは手元の macOS である。それでも明示する価値がある: 直す前の (a)(c) は
**開発者の `LANG` 次第**で色が変わり、`LANG` を設定していない人の手元では緑のまま
門が開いていた。ロケールを固定すれば、どの macOS でも同じ結果になる。

*このファイルは proposal の Impact 表に無い。利用者の判断（2026-09-12）で、この change に
含めた。理由は、`npm run check` が緑にならず、この change 自身のコミットもこの門を通るため。*

## Open Questions

- ~~Cloudflare Web Analytics が `workers.dev` のサブドメインで有効にできるか~~
  **できる**（2026-09-12 に確認）。Web Analytics は Cloudflare を経由していないサイトも
  対象で、ホスト名を手で入力してスニペットを貼る経路がある。所有ドメインは要らない。
  ただし**サイトの作成は私からはできない**: wrangler の OAuth トークンに RUM の権限が無く、
  `GET /accounts/{id}/rum/site_info/list` が `Authentication error` を返す。
  ダッシュボードで作るか、Account Analytics: Edit を持つ API トークンが要る。**利用者に依頼中。**
- タブ切替の「同等」を数値で言うなら何 ms までか。現状の実測を見てから利用者に聞く
- **`check:bundle` を CI の前に置くべきか。** いまは `check:test` が `check:build` より先に
  走るので、CI の新しいチェックアウトでは `.next` が無く、`bundle-budget.test.ts` の
  「本物のビルド結果に対して走る」1 件が飛ぶ（飛んだことは出力に出る）。組み立てた `.next` に
  対する 3 件は常に走るので、検査そのものは消えていない。順序を変えるなら `check` の
  並びを変えることになるので、A4（`enforce-layer-boundaries`）が `check:build` を使うときに
  まとめて決める
