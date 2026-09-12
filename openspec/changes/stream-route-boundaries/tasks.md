## 0. 前提

- [ ] 0.1 `git fetch origin && git log --oneline HEAD..origin/main` で差が無いことを確かめる（L14）
- [ ] 0.2 `docs/perf.md` に基準の行（一覧・タブ切替）があること。E2E スモークが緑。staging に出せること
- [ ] 0.3 `npm run harness:focus -- stream-route-boundaries`

## 1. 枠

- [ ] 1.1 骨格の見た目を 2〜3 案、いまのトークンでモックにして利用者に選んでもらう（design D2、L11）。
      同時に「一覧とタグの帯を別々に流すか」の 3 案も見せる（design D3）
- [ ] 1.2 `(app)/layout.tsx` から `getDue()` を外し、バッジを `<Suspense>` の中の Server Component にする（design D1）。
      `auth.arch.test.ts` の「画面の枠がサーバー側で利用者を確認している」が緑のまま
- [ ] 1.3 4 経路に `loading.tsx` を置く。選ばれた骨格
- [ ] 1.4 本番ビルド（`npm run preview` か staging）で、タブの `<Link>` が prefetch を出すことをネットワーク欄で
      確かめる（`next dev` では prefetch は走らない）。`tab-bar.tsx` の「先読みする」のコメントが**事実になった**ことを確かめる
- [ ] 1.5 D3 の答えに従い、一覧の Container を `<Suspense>` で分ける（分けない答えなら何もしない）

## 2. 失敗

- [ ] 2.1 `(app)/error.tsx`。文言は design-decisions のトーン。`reset()` のボタン
- [ ] 2.2 3 つの Container の `try/catch` と「途中の形」のコメントを消す
- [ ] 2.3 取得を一時的に throw させて `error.tsx` が出ること、空の一覧と見分けがつくこと、戻して出ないことを確かめる（L06）
- [ ] 2.4 `navigation` spec の追加シナリオ 3 件を `tests/architecture/navigation.arch.test.ts` か E2E に書く

## 3. 実測

- [ ] 3.1 案 1（`loading.tsx` だけ）で staging に出し、`docs/perf.md` の手順でタブ切替を 5 回測る。基準値と比べて design D5 の表に書く
- [ ] 3.2 「同等」に届かなければ案 2（`staleTimes.dynamic: 30`）で測り直す。届いていれば案 2 は入れない。採った案と数値を design に書く
- [ ] 3.3 「一覧が読めるまで」と「枠が見えるまで」を 5 回測り、Performance トレースで枠が先に描かれることを示す（design D6）
- [ ] 3.4 利用者に staging で触ってもらい、タブ切替の体感が現状と同等かを聞く（L10）

## 4. 締め

- [ ] 4.1 E2E スモークが緑（採点後にバッジが減る段を足す。design Risks）。`npm run check` が緑
- [ ] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 4.3 `docs/nextjs-rework-plan.md` の表に結果を書く
