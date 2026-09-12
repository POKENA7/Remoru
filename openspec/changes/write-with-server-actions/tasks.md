## 0. 前提と最初に確かめること

- [ ] 0.1 `server-side-reads` と `stream-route-boundaries` が済んでいる。`npm run harness:focus -- write-with-server-actions`
- [ ] 0.2 **D4 を確かめる。** 仮の Action から `createMemo` + `startGeneration` を呼び、staging（`ANTHROPIC_API_KEY` を一時投入）で
      問答が生成されることを見る。結果を design D4 に書く。取れなければ 3.8 を後回しにする

## 1. 入口の形

- [ ] 1.1 `features/first-run/actions.ts` を最初の 1 本として書く（design D1）。最も小さい
- [ ] 1.2 `lib/action-boundary.test.ts` を書く（design D2）。4 種の違反を注入して赤、戻して緑
- [ ] 1.3 `lib/layer-boundary.test.ts` の規則 3 が `actions` を対象にして**いない**ことを確かめる
      （`enforce-layer-boundaries` D1 は `actions` を対象外と定めている。Server Action は Client Component から
      import して呼ぶのが正規の使い方）。もし対象に入っていれば、検査本体と `CLAUDE.md` の規則表を直す。
      `enforce-layer-boundaries` は archive 済みの前提なので、その design は触らない

## 2. 楽観的な保存

- [ ] 2.1 楽観的な行の見た目をモックで 1 つ出し、確認を取る（design Open Questions、L11）
- [ ] 2.2 `features/memo/actions.ts` の `saveMemo`。**Handler はまだ消さない**（D4 の答えの後）
- [ ] 2.3 一覧の保存フォームを `useActionState` + `useOptimistic` にする（design D3）。刷りの合図を一時 id にする
- [ ] 2.4 検査: 保存後に刷りが 1 回だけ起きる / 失敗で仮の行が消え本文が入力欄に戻る。
      Action を失敗させて赤、戻して緑（L06）
- [ ] 2.5 `memo-capture` の「投入から一覧への即時反映」「保存に失敗しても入力内容が残る」を `next dev` で辿る（L05）

## 3. 書き込みを 1 本ずつ移す（design D5 の順）

各段の完了条件: 画面が Action を呼ぶ / `next dev` で操作を通す / Handler を消す / `npm run check` と E2E が緑

- [ ] 3.1 `first-run`（`POST /api/first-run` を消す）
- [ ] 3.2 `review` の採点（`/api/review/[quizItemId]`）。`revalidatePath("/review")` と `"/record"`
- [ ] 3.3 `tag` の付け外し（`/api/memos/[id]/tag`）
- [ ] 3.4 `memo` の編集・削除（`/api/memos/[id]`）。削除後は `redirect("/")`
- [ ] 3.5 `quiz` の書き直し（`/api/memos/[id]/quiz-item`）
- [ ] 3.6 `notification` の設定と購読（`/api/notifications/*`）。購読は JSON を引数で受ける。
      `open-issues` の欠陥は**直さない**が、返り値で失敗を返せる形にする
- [ ] 3.7 `tag` の提案（`POST /api/tags/suggestion`）。モデル呼び出しを含むので所要が長い。
      Action のタイムアウトに掛からないことを staging で確かめる
- [ ] 3.8 `memo` の保存（`POST /api/memos`）。D4 が肯定なら消す。否定なら理由を design に書いて残す

## 4. 後始末

- [ ] 4.1 `app/api/` が空、または残るものの理由が design に 1 行ずつある
- [ ] 4.2 `lib/layer-boundary.test.ts` の許容リストを `[]` にする（design D7）。緑
- [ ] 4.3 `server-side-reads` が残した「`router.refresh()` は途中の形」のコメントを、ポーリングの箇所を除いて消す
- [ ] 4.4 `docs/perf.md` の手順で「一覧が読めるまで」を測る（変わらないはず。変わったら理由を書く）。
      `check:bundle` の値を見る（`fetch` の周辺コードが消えるので少し減るはず）。予算を下げる
- [ ] 4.5 staging で 1 周（保存 → 詳細 → タグ → 採点 → 削除）を利用者に確かめてもらう（L10）

## 5. 締め

- [ ] 5.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 5.2 `docs/nextjs-rework-plan.md` の表に結果を書く
