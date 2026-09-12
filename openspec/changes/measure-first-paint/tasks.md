## 1. 転送量の検査

- [x] 1.1 `scripts/harness/bundle-budget.mjs` を書く（design D3）。`.next/build-manifest.json` の
      `rootMainFiles` と `.next/server/app/<経路>/page_client-reference-manifest.js` が参照する
      チャンクの和集合を gzip して足し、`bundle-budget.json` と比べる。
      ~~**本番で測った 224 KB に ±5% で一致すること**を確かめる~~
      → **検算の相手を取り違えていた。** 224 KB は `/` ではなく `/sign-in` の値で、
      さらに `noModule` の polyfill 38.6 KB を含んでいた（design Context の追記）。
      **代わりに、同じ式を `/sign-in` に当てて本番と 1 バイト単位で突き合わせた。**
      本番の HTML が挙げる 11 本を実取得した合計 **223,559 B** に対し、ローカルのビルドから
      計算した値 **223,565 B**。**差 6 バイト**で読む場所を確認した。
      `/` の実測は **206,221 B / 13 チャンク**（polyfill を除く。利用者判断）
- [x] 1.2 `package.json` に `check:build`（`next build`）と `check:bundle` を足し、`check` の末尾に並べる。
      `npm run check` が緑 → **緑**（3 分 13 秒。うち `next build` が 31.5 秒）。
      出力は `/  実測 206.2 KB  予算 216.5 KB  差 -10.3 KB  (13 チャンク)`
- [x] 1.3 `scripts/harness/bundle-budget.test.ts` を書く（L06）。予算を実測より小さくした
      `bundle-budget.json` を渡して非ゼロで終わること、戻すと 0 で終わることを見る。
      → **注入して赤くなることを 3 通り確かめた**（どれも戻すと 4 件全緑）:
      (A) page manifest を読まなくする → 3 件赤
      (B) `process.exit(failed ? 1 : 0)` を `exit(0)` にする → 3 件赤
      (C) `polyfillFiles` も足す → 3 件赤（うち 1 件は**組み立てた `.next` だけで**捕まる）
      入力は**その場で組み立てた `.next`**。本物の `.next` に頼ると、ビルドしていない環境で
      検査が黙って消える（`check:test` は `check:build` より先に走る）。
      **レビューの指摘で 1 度直した**: 最初の fixture は polyfill に `rootMainFiles` と
      同じファイルを指定しており、Set が重複除去するので (C) を組み立てた `.next` では
      捕まえられていなかった（本物の `.next` を持つテストだけが赤くなっていた＝CI で消える）。
      独立したファイルに変えて、fixture 単体で赤くなることを確かめ直した
- [x] 1.4 `next build` のあとに `git status --porcelain` が空のままであることを確かめる
      → **確かめた。** `.next/` も `next-env.d.ts` も差分に現れない
      （前者は `.gitignore:6`、後者は追跡済みで中身が変わらない）
- [ ] 1.5 CI が緑になることを見る（`check` に含まれるので `ci.yml` は変えないはず。
      Linux で `next build` が通るかは**ここで初めて分かる**——L07）

## 1b. 実装中に見つけた門の穴（利用者判断で範囲に追加）

- [x] 1b.1 `precommit-gate.sh:86` の `$hash）` が macOS の bash 3.2 + UTF-8 ロケールで
      `hash\xef` と読まれ `set -u` で **exit 1**。PreToolUse は exit 2 でなければ
      ブロックしないので、**受領書が無いコミットが素通りしていた**。`${hash}` に直した。
      同じ形を `scripts/**/*.sh` 全体で走査し、`spawn-change.sh` の 2 か所も直した（残り 0 件）
- [x] 1b.2 `precommit-gate.test.ts` に `LANG` を `C` / `en_US.UTF-8` / `ja_JP.UTF-8` に
      固定した 3 件を足す（L07）。直しを元に戻すと **UTF-8 の 2 件と既存の (a)(c) が赤くなり、
      `C` の 1 件だけ緑のまま**であることを確かめた。戻すと 14 件全緑
- [x] 1b.3 **どの環境で壊れるかを実測する**（レビューの指摘。「CI でも捕まる」と根拠なく
      書いていた）。Docker で同じ 1 行を走らせた結果、**Linux は glibc 2.36 / musl の
      どちらでも 4 ロケールすべて正常**で、壊れるのは **macOS bash 3.2 の UTF-8 ロケールだけ**。
      bash の版ではなく macOS の libc（`isalnum` が 0x80 以上を英数字と返す）の問題。
      → **この 3 件は CI では常に緑で何も守らない**ことを design とテストのコメントに明記した

## 2. 計測の手順書

- [x] 2.1 `docs/perf.md` を書く（design D1・D2・D5）。指標の定義、端末と条件、回数、
      Performance トレースの読み方（どの要素の描画時刻を読むか、スクリーンショットの撮り方）、
      記録の表の形。実機の手順（§7）と、検査が見ないもの（§6）も書いた
- [ ] 2.2 手順書どおりに Chrome DevTools で本番のサインイン済み `/` を 5 回測り、
      表に「基準（change 前）」の行を書く。**LCP 要素が何かを備考に書く**
      → **MCP を追加済み（`claude mcp add chrome-devtools`、Connected）。反映にはセッション再起動が要る。**
      あわせて Clerk の E2E テスト利用者の資格情報を待っている
- [ ] 2.3 同じ手順でタブ切替（メモ → 復習 → 記録）を 5 回測り、表に書く。
      これが以後の「現状と同等」の基準
- [ ] 2.4 コールド（10 分以上放置後）を 3 回測り、別の行に書く
- [ ] 2.5 実機（iPhone、PWA、Wi‑Fi）の計測は利用者に手順書を渡して依頼する。
      **確認できていないことを明示する**（L10）。値が届いたら表に足す
      → `docs/perf.md` §7 に手順を書いた。§8 の表の実機の行は**空のまま**にし、
      「未計測。利用者に依頼中」と明記した

## 3. 実利用者の値

- [x] 3.1 Cloudflare Web Analytics で本番のサイトを追加できるか確かめる（design Open Questions）。
      → **仕様としては可能。** Web Analytics は Cloudflare を経由していないサイトも対象で、
      ホスト名を手で入力する経路がある。所有ドメインは要らない。
      **ただし私からは作成できない**: wrangler の OAuth トークンに RUM の権限が無く、
      `GET /accounts/{id}/rum/site_info/list` が `Authentication error`（code 10000）を返す。
      3.2 は利用者がダッシュボードでサイトを作るか、Account Analytics: Edit の API トークンを
      渡すまで進められない
- [ ] 3.2 ビーコンを `app/layout.tsx` に `<Script strategy="afterInteractive">` で入れる。
      本番に出したあと、ダッシュボードに値が届くことを見る（届くまで数分〜数時間）
      → **利用者待ち**（3.1 参照。トークンが要る）

## 4. 締め

- [ ] 4.1 `performance` spec の 2 つの要件が、`docs/perf.md` の指標の定義と同じ言葉で
      書かれていることを確かめる（spec と手順書で「一覧が読めるまで」の定義がずれない）
- [ ] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 4.3 `docs/nextjs-rework-plan.md` の表に「A1 完了」と基準値を書く
