## 1. データアクセス層の下ごしらえ

画面を触る前に、Server Components から呼べる形にする。ここは画面が変わらないので、
壊れても原因が分かりやすい。

- [x] 1.1 `lib/session.ts` に `verifySession()` を足す（design D8）。未認証なら
      `/sign-in` へ送る。`getCurrentUserId()` は残す。既存の `auth-boundary` の
      検査が緑のままであること
- [x] 1.2 各 feature に `queries.ts` を新設する（design D8）。`verifySession()` →
      `getDb()` → ドメイン関数、の順に呼ぶだけの薄い層。**ドメイン関数は触らない**。
      既存のテストが 1 つも壊れないこと
- [x] 1.3 `queries.ts` の各関数を React の `cache()` でラップし、**構造の検査**を
      書く（design D8）。`queries.ts` をファイルとして読み、公開する関数が全部
      `cache()` で包まれていること・`server-only` があることを見る。
      包み忘れを 1 つ注入して赤くなることを確かめる（L06）。
      **メモ化が実際に効いていることは 3.1 で実行して確かめる**——
      `server-only` は vitest から import できず、`cache()` は React の文脈の外では
      メモ化しないため、単体テストでは確かめられない
- [x] 1.4 `server-only` を `lib/db.ts` と各 `queries.ts` に入れる（design D7・D8）。
      **ドメイン関数には付けない**——`cron-worker` が読む 4 本が含まれるため
- [x] 1.5 1.4 を検査で固定する（L06）。**恒常的に守るのは
      `tests/architecture/query.arch.test.ts`**（`server-only` の有無・`cache()` の包み・
      `verifySession()` の呼び出し・cron が読む 4 本に `server-only` が無いこと）。
      **「実際にビルドが落ちる」ことは注入して一度確かめる**——毎回の検査に
      `next build` は載せられないため。

      **実測の記録**:

      (a) `app/record-tab.tsx`（`"use client"`）に `import { getDb } from "@/lib/db"`
      を注入 → `next build` が失敗し、次の trace を出した:

      ```
      It should only be used from a Server Component.
      Client Component Browser:
        ./lib/db.ts [Client Component Browser]
        ./app/record-tab.tsx [Client Component Browser]
      ```

      注入を戻したあと `next build` は EXIT=0。

      (b) `tests/architecture/query.arch.test.ts` に 4 種の違反を注入し、いずれも EXIT=1:
      `cache()` の包み忘れ / `queries.ts` から `server-only` を外す /
      cron が読む `review-scheduler.ts` に `server-only` を付ける /
      `queries.ts` で `Date.now()` を直に読む。4 つとも戻したあと EXIT=0

- [x] 1.6 「いま」をリクエストに 1 つにする（`lib/request-clock.ts`）。
      **レビューの指摘で足した。** 取得関数がそれぞれ `Date.now()` を読むと、
      同じ画面の中で違う時刻を見る。日境界をまたいだときだけ「復習の一覧」と
      「未作成の件数」が別々の日で判定され、噛み合わない数が出る（L07 と同種）。
      `queries.ts` が時計を直に読まないことを検査で固定した

## 2. 経路の骨格

- [x] 2.1 `app/(app)/layout.tsx` を作り、下部タブを `<Link>` で置く（design D1）。
      `aria-selected` の判定は `usePathname()` を使う小さな Client Components に
      切り出す。この時点では中身は既存の `AppShell` のままでよい。
      `npm run check` が緑
- [ ] 2.2 `/review` `/record` `/memos/[memoId]` の `page.tsx` を作る。中身は
      仮のままでよい。4 つの経路が開けることを確かめる。
      **確認できた範囲**: `next build` の出力に 4 経路が並ぶこと、未認証で
      いずれも `/sign-in` へ送られること（`(app)/layout.tsx` の
      `verifySession()` が全経路を覆っている）。
      **確認できていない範囲**: サインイン済みで各画面が正しく描かれること。
      この環境ではブラウザ枠の実クリックが効かず、Clerk のサインインを
      通せない。タスク 5.1（実機）に委ねる。
      **したがって未完のまま置く。** 実機で 4 経路が開けるのを見たときに印を付ける
- [ ] 2.3 `navigation` spec のうち、**この段で満たせるものだけ**を検査に書く
      （`tests/architecture/navigation.arch.test.ts`）。4 つの経路が存在すること、
      タブが `<Link>` で経路を移ること、通知の行き先が `/review` であること。
      違反を 3 種注入して赤くなることを確かめた（L06）。

      **「戻る操作は直前に見ていた画面へ返す」はまだ満たしていない。**
      一覧から詳細を開く `openDetail()` はいまもクライアント状態を変えるだけで、
      履歴に何も積まない。したがって端末の戻る操作は一覧へ戻らず、アプリの外へ
      抜ける——`navigation` spec の MUST NOT に触れている状態である。
      これを直すのはタスク 3.5。**したがってこのタスクは未完である**。
      3.5 で「戻る」の検査まで書いたときに印を付ける（レビューで 2 度、
      完了印の付けすぎを指摘されて外した — L08）

- [x] 2.4 通知からの復帰先を `?tab=review` から `/review` に変える。
      `public/sw.js` と `features/notification/notification-message.ts` の
      `REVIEW_URL` を追従させる。`navigation` の通知のシナリオ 2 件が緑になること

## 3. 経路ごとに中身を移す

各タスクの完了条件は `npm run check` が緑になり、その画面が**ブラウザで
一通り動く**こと（L05: spec のシナリオを画面上で辿る）。

- [ ] 3.1 メモの一覧を Container に組み替える。
      **実装は済んでいる**:
      `app/(app)/_containers/memo-list/container.tsx` が 6 本を `Promise.all` で
      並行に取り、`features/memo/components/memo-screen.tsx` が表示する。
      絞り込みは `?tag=` を `searchParams` で受ける。
      `/api/memos` GET・`/api/tags`・`/api/tags/suggestion` GET を削除した
      （POST / PUT / DELETE は残る）。`app-shell.tsx` は復習と記録だけの
      薄い形に縮んだ。

      **完了条件のうち 1 つが未達**: 「`cache()` のメモ化が効いていることを
      実行で一度確かめる」。`getDb` に計器を入れて一覧を 1 回描かせようとしたが、
      **この環境ではサインインを通せず 307 で止まる**ため、ページが描画されない。
      タスク 5.1（実機）で確かめる。
      それまでの担保は `tests/architecture/query.arch.test.ts` の構造検査
      （公開する関数が全部 `cache()` で包まれていること）である

- [x] 3.2 下書きを `sessionStorage` に逃がす（design D3）。**タスク 2 のレビューで
      前倒しした**——タブを `<Link>` にした時点で回帰が入るため、同じコミットで
      直さないと一時的に壊れた状態が残る。
      `hooks/use-session-state.ts` に `useSessionState` を置き、
      `tests/architecture/unmount.arch.test.ts` を「経路をまたいでも残る場所にあること」を
      見る形に強めた。違反を 3 種注入して赤くなることを確かめた（L06）:
      下書きを `useState` に戻す / `localStorage` に変える /
      絞り込みを画面の中に戻す
- [ ] 3.3 タグの提案結果を同じ仕組みに載せる（design D4）。3.2 と同じ理由で前倒し。
      実装は済んでいる（`useSessionState("remoru:tag-suggestion", null)`）。
      **完了条件のブラウザ確認が未実施**——この環境ではサインインを通せない。
      タスク 5.1（実機）で提案を受け取った状態のまま経路を移って戻り、
      残っているのを見たときに印を付ける（2.2 と同じ扱い）
- [ ] 3.4 初回の告知を、サーバーの記録だけで出し分ける（design D5）。
      `notice` `noticeAnswer` を `app-shell` から外す。`first-run` spec の
      「別の画面へ移って戻る」シナリオが緑であること
- [ ] 3.5 メモの詳細。`/memos/[memoId]` に移す。他人のメモと、消えたメモの経路を
      開いたときの振る舞いを `navigation` `memo-capture` のシナリオどおりにする。
      **2.3 から持ち越し**: 一覧から詳細を開くのを経路の遷移にし
      （`router.push`）、閉じるのを履歴の戻り（`router.back`）にする。
      「戻る操作は直前に見ていた画面へ返す」の検査をここで書く。
      **3.2（下書きの保持）より後に行う**——先に詳細を経路にすると、
      詳細を開くたびに書きかけの本文が消える
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
