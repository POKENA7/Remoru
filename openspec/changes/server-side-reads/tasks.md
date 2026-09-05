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
- [x] 2.2 `/review` `/record` `/memos/[memoId]` の `page.tsx` を作り、
      4 つの経路が開けることを確かめた。
      **利用者にサインインしてもらい、ブラウザ枠で実際に辿った**:
      タブを押すと URL が `/` `/review` `/record` に変わり、`aria-selected` も
      追従する。詳細は `/memos/<id>` で描画され、「メモ」が選択状態になる

- [x] 2.3 `navigation` spec を検査に書く（`tests/architecture/navigation.arch.test.ts`）。
      4 つの経路が存在すること、タブが `<Link>` で経路を移ること、
      通知の行き先が `/review` であること、**戻る操作が直前に見ていた画面へ
      返すこと**。違反を 6 種注入して赤くなることを確かめた（L06）。
      「戻る」の分はタスク 3.5 で満たしたので、ここで閉じる

- [x] 2.4 通知からの復帰先を `?tab=review` から `/review` に変える。
      `public/sw.js` と `features/notification/notification-message.ts` の
      `REVIEW_URL` を追従させる。`navigation` の通知のシナリオ 2 件が緑になること

## 3. 経路ごとに中身を移す

各タスクの完了条件は `npm run check` が緑になり、その画面が**ブラウザで
一通り動く**こと（L05: spec のシナリオを画面上で辿る）。

- [x] 3.1 メモの一覧を Container に組み替えた。
      `app/(app)/_containers/memo-list/container.tsx` が 6 本を `Promise.all` で
      並行に取り、`features/memo/components/memo-screen.tsx` が表示する。
      絞り込みは `?tag=` を `searchParams` で受ける。
      `/api/memos` GET・`/api/tags`・`/api/tags/suggestion` GET を削除した。

      **`cache()` のメモ化を実行で確かめた**（1.3 から持ち越し）。`listMemos` に
      計器を入れ、Container から `getMemos` を同一リクエスト内で 3 回呼んだところ、
      **`listMemos` の実行は 1 回だけ**だった。計器は戻してある

- [x] 3.2 下書きを `sessionStorage` に逃がす（design D3）。**タスク 2 のレビューで
      前倒しした**——タブを `<Link>` にした時点で回帰が入るため、同じコミットで
      直さないと一時的に壊れた状態が残る。
      `hooks/use-session-state.ts` に `useSessionState` を置き、
      `tests/architecture/unmount.arch.test.ts` を「経路をまたいでも残る場所にあること」を
      見る形に強めた。違反を 3 種注入して赤くなることを確かめた（L06）:
      下書きを `useState` に戻す / `localStorage` に変える /
      絞り込みを画面の中に戻す
- [x] 3.3 タグの提案結果を `sessionStorage` に載せた
      （`useSessionState("remoru:tag-suggestion", null)`）。
      **提案を持った状態でタブを移って戻り、残っていることをブラウザで確認した**

- [x] 3.4 初回の告知を、サーバーの記録だけで出し分ける（design D5）。
      判定の入力は `guided`（サーバーの記録）と `memos` だけ。端末側に
      「もう出した」を覚えさせる形へ戻す変更は検査で止める（L06 で確認）。

      **spec とぶつかったので改定した**（利用者の判断）。`first-run` の
      「答えたことが残る」は「移って戻ったとき、同じ問いを示さず**答えたあとの
      状態のままにする**」と書いていたが、画面が経路を持つと描き直されるため
      礼は残らない。残すべきなのは「もう問わない」であって「答えた」という
      表示ではない、として delta を書いた

- [x] 3.5 メモの詳細を `/memos/[memoId]` に移した。
      `MemoDetailContainer` が経路の id で直接引くので、**一覧を経由しない**。
      絞り込みの状態や一覧に載っているかに左右されなくなり、
      `resolveDetail`（一覧から消えたときの拠り所）が不要になったので消した。
      他人のメモと消えたメモはどちらも `notFound()`——区別すると id の総当たりで
      存在だけが分かる。`not-found.tsx` を置き、一覧へ戻る手段を残した。
      消したあとは `router.back()` ではなく `router.replace("/")`——戻ると
      消したメモの経路に当たる

- [x] 3.6 復習。`DueReviewContainer` が `getDue()` で取り、
      `features/review/components/review-screen.tsx` が表示する。
      `/api/review/due` を削除
- [x] 3.7 記録。`LearningRecordContainer` が取り、`RecordTab` は表示だけになった
      （`"use client"` が外れ、Shared Components になった）。
      `/api/learning-record` を削除
- [ ] 3.8 通知設定をシートとして出す（design D6）。経路は与えない。
      `sheet` spec の「閉じたあと焦点を戻す」が緑であること

## 4. 後始末

- [x] 4.1 書き込み後の再取得を `router.refresh()` に揃えた（design D9）。
      メモの保存・タグの付け外し・問答の編集・削除・復習の採点・タグの提案の
      承認と見送り、すべてが通る。**「次の change で `revalidatePath()` になる
      途中の形」**であることを 3 か所のコメントに残した。
      消したあとだけ `router.replace("/")`——戻ると消したメモの経路に当たる

- [x] 4.2 `app/app-shell.tsx` を**削除した**。通知のタップを受ける部分だけ
      `app/(app)/notification-bridge.tsx`（画面を持たないクライアント部品）に
      切り出し、`(app)/layout.tsx` に置いた——どのタブを開いていても効く必要がある。

      **`"use client"` が残るのは 13 ファイル**で、すべて『Next.jsの考え方』
      第12章の「クライアントサイド処理」に当たる:
      `notification-bridge`（Service Worker のメッセージ）
      `tab-bar`（`usePathname`）`sheet`（ポインタと Escape）
      `use-session-state`（`sessionStorage`）
      `notification-settings`（通知の許可という Browser API）
      残る 8 つは `useState` とイベントハンドラを持つ画面部品。
      サードパーティ都合と RSC Payload 削減に当たるものは無い。
      **`record-tab.tsx` は `"use client"` が外れた**（取得を Container に移した結果、
      props を受けて描くだけになった）
- [x] 4.3 読み取り専用の 5 本が消えていること: `/api/memos` GET・`/api/tags`・
      `/api/review/due`・`/api/learning-record`・`/api/tags/suggestion` GET。
      **5 本とも削除済み**。

      **ただし「残ったのが書き込みと通知購読だけ」にはなっていない。**
      GET が 2 本残っている:
      `/api/memos/[memoId]/quiz-item` GET（詳細を開いたときに問答を読む）と
      `/api/notifications/settings` GET（設定を開いたときに読む）。
      どちらも**利用者の操作をきっかけにした読み取り**で、第9章が
      Server Functions と `useActionState()` に寄せよと言っている類である。
      次の change（書き込みの Server Actions 化）で一緒に扱う
- [x] 4.4 クライアントバンドルのサイズを前後で比べ、design.md に記録した。
      **773.6 KB → 827.0 KB（+6.9%）で、減っていない。**
      経路が 1 本から 4 本になったぶんチャンクが増えている。
      ただしこれは 4 経路ぶんの合計で、利用者 1 人が読み込む量ではない。
      Turbopack のこの構成では経路ごとの First Load JS が出ないため内訳は
      取れなかった。**体感としての断定はしない**——タスク 5.2 で実機で見る

## 5. 実機での確認（L10）

ブラウザ枠では確認できない。**確認できていない範囲を明示して実機に委ねる。**

- [x] 5.1 デプロイして iPhone（PWA）で開いてもらった。タブの切り替え、詳細の
      開閉、戻る操作を辿った。
      **欠陥が 1 件出た**——絞り込んだ一覧から詳細を開き、下部タブの「メモ」で
      戻ると絞り込みが外れる（design D13）。直して出し直し、**直っていることを
      確認してもらった**
- [x] 5.2 タブ切替の体感（Open Questions）。**耐えられるとの回答**。
      クライアント保持へ戻す退路は使わない。経路もそのまま。
      Open Questions のこの項目は閉じる
- [ ] 5.3 iOS のスワイプバックが詳細から一覧へ効くことを確かめる。
      **未確認のまま残す**（利用者があとで見る）。`docs/open-issues.md` に移した
- [ ] 5.4 焦点の復元が Next.js のスクロール復元だけで足りるかを確かめる
      （design D10 / Open Questions）。**未確認のまま残す**。
      `docs/open-issues.md` に移した
- [ ] 5.5 通知をタップして `/review` に入ることを、アプリを閉じた状態と
      開いた状態の両方で確かめる。**未確認のまま残す**。
      `docs/open-issues.md` に移した

## 6. 締め

- [x] 6.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [x] 6.2 CI が緑になったことを見る（L07: 手元で緑でも CI で落ちる欠陥は過去 4 件）
- [x] 6.3 `add-tags` の D5「絞り込みは URL に持たない」を改定したことを、
      `docs/design-decisions.md` に残した
