## 1. 転送量の検査

- [ ] 1.1 `scripts/harness/bundle-budget.mjs` を書く（design D3）。`.next/build-manifest.json` の
      `rootMainFiles` と `.next/server/app/page_client-reference-manifest.js` が参照する
      チャンクの和集合を gzip して足し、`bundle-budget.json` と比べる。
      **本番で測った 224 KB に ±5% で一致すること**を確かめる。一致しなければ読む場所が違う
- [ ] 1.2 `package.json` に `check:build`（`next build`）と `check:bundle` を足し、`check` の末尾に並べる。
      `npm run check` が緑
- [ ] 1.3 `scripts/harness/bundle-budget.test.ts` を書く（L06）。予算を実測より小さくした
      `bundle-budget.json` を渡して非ゼロで終わること、戻すと 0 で終わることを見る。
      `scripts/harness/checks.test.ts` の作法に合わせる
- [ ] 1.4 `next build` のあとに `git status --porcelain` が空のままであることを確かめる
      （`.next/` と `next-env.d.ts` が差分にならないこと）
- [ ] 1.5 CI が緑になることを見る（`check` に含まれるので `ci.yml` は変えないはず。
      Linux で `next build` が通るかは**ここで初めて分かる**——L07）

## 2. 計測の手順書

- [ ] 2.1 `docs/perf.md` を書く（design D1・D2・D5）。指標の定義、端末と条件、回数、
      Performance トレースの読み方（どの要素の描画時刻を読むか、スクリーンショットの撮り方）、
      記録の表の形
- [ ] 2.2 手順書どおりに Chrome DevTools で本番のサインイン済み `/` を 5 回測り、
      表に「基準（change 前）」の行を書く。**LCP 要素が何かを備考に書く**
- [ ] 2.3 同じ手順でタブ切替（メモ → 復習 → 記録）を 5 回測り、表に書く。
      これが以後の「現状と同等」の基準
- [ ] 2.4 コールド（10 分以上放置後）を 3 回測り、別の行に書く
- [ ] 2.5 実機（iPhone、PWA、Wi‑Fi）の計測は利用者に手順書を渡して依頼する。
      **確認できていないことを明示する**（L10）。値が届いたら表に足す

## 3. 実利用者の値

- [ ] 3.1 Cloudflare Web Analytics で本番のサイトを追加できるか確かめる（design Open Questions）。
      できなければ理由を design.md に書いて 3.2 を飛ばす
- [ ] 3.2 ビーコンを `app/layout.tsx` に `<Script strategy="afterInteractive">` で入れる。
      本番に出したあと、ダッシュボードに値が届くことを見る（届くまで数分〜数時間）

## 4. 締め

- [ ] 4.1 `performance` spec の 2 つの要件が、`docs/perf.md` の指標の定義と同じ言葉で
      書かれていることを確かめる（spec と手順書で「一覧が読めるまで」の定義がずれない）
- [ ] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 4.3 `docs/nextjs-rework-plan.md` の表に「A1 完了」と基準値を書く
