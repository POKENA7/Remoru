## 0. 前提

- [ ] 0.1 `stream-route-boundaries` と `move-client-boundary-to-leaves` が済んでいる。
      `npm run harness:focus -- optimistic-memo-save`
- [ ] 0.2 保存フォームと一覧（`memos`）がどのファイルにあるかを確かめ、`useOptimistic` の置き場を design の Open Questions に書く

## 1. 実装

- [ ] 1.1 仮の行の見た目が既存の「作成中」の行と同じであることを確かめる。違うならモックで確認を取る（design D2、L11）
- [ ] 1.2 `useOptimistic` で仮の行を先頭に置き、`fresh` を仮の id で立てる（design D1）
- [ ] 1.3 失敗時に仮の行が消え、本文が入力欄に戻り、エラーが操作した場所に出る（design D3）

## 2. 検査

- [ ] 2.1 design D4 の 3 件を検査に書く。action を失敗させて赤、戻して緑（L06）
- [ ] 2.2 `memo-capture` の「投入から一覧への即時反映」の 7 シナリオを `next dev` で辿る（L05）
- [ ] 2.3 E2E スモークが緑。`npm run check` が緑

## 3. 締め

- [ ] 3.1 staging で利用者に保存の手応えを確かめてもらう（L10）
- [ ] 3.2 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 3.3 `docs/nextjs-rework-plan.md` の表に結果を書く
