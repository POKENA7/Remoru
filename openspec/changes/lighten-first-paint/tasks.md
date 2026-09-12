## 0. 前提

- [ ] 0.1 `measure-first-paint` が済んでおり、`docs/perf.md` に基準の行があることを確かめる。無ければ先にそちら
- [ ] 0.2 `npm run harness:focus -- lighten-first-paint`（`review-with-change-context` が済んでいれば）

## 1. フォント

- [ ] 1.1 `app/layout.tsx` を `next/font/google` に置き換え、`<link>` 3 本を消す（design D1）。
      `globals.css` の `font-family` を変数経由にする
- [ ] 1.2 `next build` が通る（CI でも。Google への接続が落ちたら design Risks の `next/font/local` へ）
- [ ] 1.3 本番 HTML に `fonts.googleapis.com` への参照が**無い**ことを curl で確かめる
      （staging があれば staging で）
- [ ] 1.4 `docs/perf.md` の手順で 5 回測り、「フォント後」の行を書く。中央値の差がばらつきを超えなければ revert して記録

## 2. Provider の範囲

- [ ] 2.1 `docs/design-decisions.md` で `UserButton` の置き場の記述を探し、`/account` を足すことの影響を確かめる
- [ ] 2.2 `/account` の見た目のモックを 1 つ出し、利用者の確認を取る（L11）
- [ ] 2.3 `app/(auth)/layout.tsx` に `ClerkProvider` を移し、sign-in / sign-up を `(auth)` の下へ移す。
      `app/layout.tsx` から Provider を消す。`next dev` で `/` の `auth()` が動くことを確かめる（design D2 の要検証）
- [ ] 2.4 `app/(auth)/account/page.tsx` を作り、`UserButton` を置く。`features/memo/components/memo-tab.tsx` の `UserButton` を
      `/account` へのリンクに替える。アバター画像の取り方は design Open Questions の答えに従う
- [ ] 2.5 サインイン → `/` → `/account` → サインアウト → `/sign-in` へ戻る、を `next dev` で辿る。
      E2E スモーク（`add-e2e-smoke`）が緑
- [ ] 2.6 本番（または staging）の `/` の HTML に `clerk.accounts.dev` への `<script>` が**無い**こと、
      `/sign-in` には**ある**ことを curl で確かめる
- [ ] 2.7 `docs/perf.md` の手順で 5 回測り、「Provider 後」の行を書く。差が無ければ revert して記録

## 3. 予算と記録

- [ ] 3.1 `bundle-budget.json` を実測 + 5% に下げる（自前 JS は変わらないはずなので、値は動かないかもしれない。
      Clerk は自前 JS の外なので `check:bundle` の対象外——**その旨を `docs/perf.md` に書く**）
- [ ] 3.2 `wrangler tail` で `/sign-in` の TTFB のばらつきを切り分け、design D4 に結果を書く
- [ ] 3.3 実機（iPhone）で FOUT の見え方とサインアウトの経路を利用者に確かめてもらう（L10）

## 4. 締め

- [ ] 4.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 4.2 `docs/nextjs-rework-plan.md` の表に結果（前後の値）を書く
