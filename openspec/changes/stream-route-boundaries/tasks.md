## 0. 前提

- [ ] 0.1 `server-side-reads` の 2〜4 章が済み、staging で 4 経路が開けることを確かめる
- [ ] 0.2 `docs/perf.md` に基準の行（一覧・タブ切替）があることを確かめる
- [ ] 0.3 `npm run harness:focus -- stream-route-boundaries`

## 1. 骨格と枠

- [ ] 1.1 骨格の見た目を 2〜3 案、いまのトークンでモックにして利用者に選んでもらう（design D2、L11）。
      同時に「一覧とタグの帯を別々に流すか」の 3 案も見せる（design D3）
- [ ] 1.2 `(app)/layout.tsx` が `verifySession()` を呼び、取得を持たないことを確かめる（design D1）。
      持っていれば Container へ下ろす
- [ ] 1.3 4 経路に `loading.tsx` を置く。選ばれた骨格
- [ ] 1.4 本番ビルド（`npm run preview` か staging）で、タブの `<Link>` が prefetch を出すことを
      ネットワーク欄で確かめる（`next dev` では prefetch は走らない）
- [ ] 1.5 D3 の答えに従い、一覧の Container を `<Suspense>` で分ける（分けない答えなら何もしない）

## 2. 失敗と不在

- [ ] 2.1 `(app)/error.tsx`。文言は design-decisions のトーン。`reset()` のボタン
- [ ] 2.2 `(app)/memos/[memoId]/not-found.tsx`。Container が無い・他人のメモで `notFound()` を呼ぶ。
      `navigation` spec「他人のメモの詳細は開けない」と「無いメモの経路」のシナリオが緑
- [ ] 2.3 取得を一時的に throw させて `error.tsx` が出ること、戻して出ないことを確かめる（L06）

## 3. 実測

- [ ] 3.1 案 1（`loading.tsx` だけ）で staging に出し、`docs/perf.md` の手順でタブ切替を 5 回測る。
      基準値と比べて design D5 の表に書く
- [ ] 3.2 「同等」に届かなければ案 2（`staleTimes.dynamic: 30`）で測り直す。届いていれば案 2 は入れない。
      どちらを採ったかと数値を design に書く
- [ ] 3.3 「一覧が読めるまで」も 5 回測り、`server-side-reads` 後の値と比べる。枠が一覧より先に描かれることを
      Performance トレースで示す
- [ ] 3.4 利用者に staging で触ってもらい、タブ切替の体感が現状と同等かを聞く（L10）

## 4. 締め

- [ ] 4.1 E2E スモークが緑。`npm run check` が緑
- [ ] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 4.3 `server-side-reads` の merge と同じ日にこの change を merge する（design D6）。
      本番で `docs/deploy.md` の確認節を通す
- [ ] 4.4 `docs/nextjs-rework-plan.md` の表に結果を書く
