## 1. データアクセス層の下ごしらえ

画面を触る前に、Server Components から呼べる形にする。ここは画面が変わらないので、
壊れても原因が分かりやすい。

- [ ] 1.1 `lib/session.ts` に `verifySession()` を足す（design D8）。未認証なら
      `/sign-in` へ送る。`getCurrentUserId()` は残す。既存の `auth-boundary` の
      検査が緑のままであること
- [ ] 1.2 `features/*/` の取得関数を React の `cache()` でラップする（design D8）。
      同じ引数で 2 回呼んで 1 回しかデータベースに行かないことをテストで確かめる
- [ ] 1.3 各取得関数の中で `verifySession()` を呼ぶ（design D8）。持ち主で絞れて
      いることは `lib/isolation.test.ts` が既に見ているので、それが緑のままであること
- [ ] 1.4 `server-only` を `lib/db.ts` と、データベースを触る feature のモジュールに
      入れる（design D7）。**`cron-worker` が読む 4 本には付けない**
- [ ] 1.5 1.4 を検査で固定する（L06）。(a) Client Component から `lib/db` を
      import する違反を注入してビルドが赤くなること、(b) cron-worker が読む 4 本に
      `server-only` が付いていないことを見る検査を書き、1 本に付けて赤くなること。
      **両方とも赤くなるのを見てから採用する**

## 2. 経路の骨格

- [ ] 2.1 `app/(app)/layout.tsx` を作り、下部タブを `<Link>` で置く（design D1）。
      `aria-selected` の判定は `usePathname()` を使う小さな Client Components に
      切り出す。この時点では中身は既存の `AppShell` のままでよい。
      `npm run check` が緑
- [ ] 2.2 `/review` `/record` `/memos/[memoId]` の `page.tsx` を作る。中身は
      仮のままでよい。4 つの経路が開けることをブラウザで確かめる
- [ ] 2.3 `navigation` spec の「主要な画面は固有の経路を持つ」「戻る操作は直前に
      見ていた画面へ返す」のシナリオを検査に書く。**この時点では落ちる**——
      2.4 以降で緑にする
- [ ] 2.4 通知からの復帰先を `?tab=review` から `/review` に変える。
      `public/sw.js` と `features/notification/notification-message.ts` の
      `REVIEW_URL` を追従させる。`navigation` の通知のシナリオ 2 件が緑になること

## 3. 経路ごとに中身を移す

各タスクの完了条件は `npm run check` が緑になり、その画面が**ブラウザで
一通り動く**こと（L05: spec のシナリオを画面上で辿る）。

- [ ] 3.1 メモの一覧。`MemoListContainer` と `TagListContainer` を
      `app/(app)/_containers/` に、Presentational を `features/memo/components/`
      `features/tag/components/` に置く（design D2）。`?tag=` を `searchParams` で
      受ける。`/api/memos` GET・`/api/tags`・`/api/tags/suggestion` GET を削除
- [ ] 3.2 下書きを `sessionStorage` に逃がす（design D3）。**検査で固定する**：
      「本文を入力 → 別の経路へ移る → 戻る → 本文が残っている」。保持を消す変更を
      入れて赤くなることを確かめてから採用する（L06）
- [ ] 3.3 タグの提案結果を同じ仕組みに載せる（design D4）。提案を受け取った状態で
      経路を移って戻り、提案が残っていることをブラウザで確かめる
- [ ] 3.4 初回の告知を、サーバーの記録だけで出し分ける（design D5）。
      `notice` `noticeAnswer` を `app-shell` から外す。`first-run` spec の
      「別の画面へ移って戻る」シナリオが緑であること
- [ ] 3.5 メモの詳細。`/memos/[memoId]` に移す。他人のメモと、消えたメモの経路を
      開いたときの振る舞いを `navigation` `memo-capture` のシナリオどおりにする
- [ ] 3.6 復習。`DueReviewContainer`。`/api/review/due` を削除
- [ ] 3.7 記録。`LearningRecordContainer`。`/api/learning-record` を削除
- [ ] 3.8 通知設定をシートとして出す（design D6）。経路は与えない。
      `sheet` spec の「閉じたあと焦点を戻す」が緑であること

## 4. 後始末

- [ ] 4.1 書き込み後の再取得を `router.refresh()` に置き換える（design D9）。
      「次の change で `revalidatePath()` になる途中の形」であることをコメントに残す。
      `memo-capture` の「投入から一覧への即時反映」が緑であること
- [ ] 4.2 `app/app-shell.tsx` を削除するか、残るものだけの薄い形にする。
      `"use client"` が残っているファイルを数え、それぞれに残す理由が
      （クライアント処理・サードパーティ・RSC Payload 削減のどれかに）
      当てはまることを確かめる
- [ ] 4.3 `app/api/` に残ったのが書き込みと通知購読だけであることを確かめる。
      読み取り専用の 5 本が消えていること
- [ ] 4.4 クライアントバンドルのサイズを移動の前後で比べ、design.md に記録する

## 5. 実機での確認（L10）

ブラウザ枠では確認できない。**確認できていない範囲を明示して実機に委ねる。**

- [ ] 5.1 デプロイして iPhone で開く。タブの切り替え、詳細の開閉、戻る操作を辿る
- [ ] 5.2 **タブ切替の体感を測る**（Open Questions）。耐えられなければ、
      該当タブの中身だけクライアント保持へ戻す。経路は戻さない。
      測った結果を design.md に書き足す
- [ ] 5.3 iOS のスワイプバックが詳細から一覧へ効くことを確かめる
- [ ] 5.4 焦点の復元が Next.js のスクロール復元だけで足りるかを確かめる
      （design D10 / Open Questions）。足りなければ明示的な焦点付けを残す
- [ ] 5.5 通知をタップして `/review` に入ることを、アプリを閉じた状態と
      開いた状態の両方で確かめる

## 6. 締め

- [ ] 6.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 6.2 CI が緑になったことを見る（L07: 手元で緑でも CI で落ちる欠陥は過去 4 件）
- [ ] 6.3 `add-tags` の D5「絞り込みは URL に持たない」を改定したことを、
      `docs/design-decisions.md` に 3 行で残す。根拠（「タブと同じ扱いにする」）が
      タブの URL 化で消えたこと
