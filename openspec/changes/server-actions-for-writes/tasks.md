## 1. 土台

- [x] 1.1 更新の手段を決める（design D5）。**`revalidatePath()` ではなく
      `next/cache` の `refresh()` を使う**——Remoru には Data Cache も
      Full Route Cache も無く、`revalidatePath()` は Router Cache を捨てる損
      だけを生むため。引数が無いのでラッパーは置かない。
      いったん置いた `lib/revalidate.ts` は削除した
- [x] 1.2 `features/quiz/queries.ts` に `getQuizItem(memoId)` を足す（design D7）。
      `query.arch.test.ts` の「公開するものは全部 `cache()` で包まれている」
      「認証を自分で確かめている」「時計を直に読まない」が緑のままであること

## 2. メモ（`features/memo/actions.ts`）

`app/api/memos/route.ts` と `app/api/memos/[memoId]/route.ts` を移す。

- [x] 2.1 `saveMemo` を作る。`verifySession()` → `createMemo()` →
      `startGeneration()` → `refresh()`。戻り値は
      `{ ok: true; memoId } | { ok: false; reason: "empty" | "too_long" | "failed" }`。
      本体全体を try/catch で包む（design D4）
- [x] 2.2 `rewriteMemoContent` と `removeMemo` を作る。どちらも同じ形。
      `removeMemo` の失敗理由は `"not_found" | "failed"`
- [x] 2.3 `memo-tab.tsx` の composer を `<form action={...}>` + `useActionState`
      にした（design D2）。`fetch("/api/memos")` は消えた。
      **action を生のまま `useActionState` に渡さず、クライアント側で包んだ**
      ——通信の失敗が error boundary に飛ぶと入力が消えるため（design D2 追記）。
      **空欄・1001 文字・保存失敗の 3 つを画面で確かめるのはタスク 10.1 で行う。**
      ここでは型と構造まで
- [x] 2.4 `memo-detail.tsx` の `remove()` を `removeMemo` の呼び出しにした。
      `fetch` は消え、失敗の分岐は `onDeleted()` の手前で return するので
      シートは閉じない。**呼ぶ側の try/catch は残した**（通信の失敗は
      戻り値にならない。design D4 追記）。
      **画面での確認はタスク 10.1**（spec `memo-capture`
      「削除に失敗しても一覧は壊れない」）
- [x] 2.5 `refresh` コールバックを 3 か所とも落とした——`memo-screen`
      （`TagSuggestionBand` の `onApplied` / `onDismissed` ごと）、
      `memo-detail-screen`（`MemoDetail` の `onChanged` ごと）、
      `memo-tab`（`onChanged`）。書き込みのあとの取り直しは action の中の
      `refresh()` が行う。**残る `router.refresh()` は 2 か所**——
      復習を終えたときと、生成中のポーリング（タスク 9.3）

## 3. 問と答（`features/quiz/actions.ts`）

`app/api/memos/[memoId]/quiz-item/route.ts` の POST と PUT を移す。GET は 1.2 へ。

- [x] 3.1 `writeQuiz`（作成）と `rewriteQuiz`（置き換え）を作る。
      `rewriteQuiz` が `review_schedules` に触れないことは `replaceQuizText`
      が担っており、そこは触らない。`scheduler.arch.test.ts` が緑のままであること
- [x] 3.2 `quiz-sheet.tsx` を `<form action={...}>` + `useActionState` にした。
      **本文を先に書き、問答をあとに書く順序を保った**（change 14 D4）。
      `target-size.arch.test.ts` の「本文を先に書く」は `fetch` の URL で
      見ていたので、action の名前で見るように書き換えた。
      **順序を逆にして赤くなることを確かめた**（L06。`expected 3584 to be
      less than 3302`）
- [x] 3.3 `memo-detail.tsx` の `answer` を props にした（design D7）。
      `MemoDetailContainer` が `getQuizDetail` を `Promise.all` に加えた。
      鉛筆の `answer === null` の判定は残した——意味が「読み込み中」から
      「問答とスケジュールが食い違っている」に変わったので、コメントを直した。
      **画面での確認はタスク 10.1**
- [x] 3.4 `fetch` を伴う `quiz-item` の参照が features/ app/ から消えた
      （`grep -rn "quiz-item" features/ app/ | grep fetch` が空）

## 4. タグ（`features/tag/actions.ts`）

`app/api/memos/[memoId]/tag/route.ts` と `app/api/tags/suggestion/route.ts` を移す。

- [x] 4.1 `assignTag` / `unassignTag` を作る。1 メモ 1 タグの差し替えは
      `setTag` が担っており、そこは触らない
- [x] 4.2 `requestTagSuggestion` / `acceptTagSuggestion` / `dismissTagSuggestion`
      を作る。**`requestTagSuggestion` は `refresh()` を呼ばない**
      （DB を変えない。design D5）。帯が出ていない状態で呼ばせない
      `suggestionStatus` の確認を action の中に残すこと
- [x] 4.3 `tag-suggestion-band.tsx` の 3 つの `fetch` を action の呼び出しに
      した。**承認に失敗しても提案を捨てない**——`onResult(null)` の手前で
      return する形は変えていない。「1 件も付かなかった」の判定は画面から
      action へ移した（`applied === 0` を `{ ok: false }` にする）。
      **画面での確認はタスク 10.1**
- [x] 4.4 `memo-detail.tsx` の `assign` / `unassign` を action にした。
      失敗の分岐と `setError` の位置は変えていない。**画面での確認はタスク 10.1**

## 5. 復習（`features/review/actions.ts`）

- [x] 5.1 `recordGrade` を作った。`occurrenceAt` による二重送信の弾きは
      `gradeReview` が担っており、触っていない。
      **この action は `refresh()` を呼ばない**——採点のたびに描き直すと
      `items` が縮んでカードが 1 枚飛ぶ（design D5 に例外として記録）
- [x] 5.2 `review-tab.tsx` の `grade()` を action にした。失敗したときに
      `setIndex` へ進まず return する形は変えていない。
      **画面での確認はタスク 10.1**（spec `review-session`
      「記録に失敗しても採点をやり直せる」）

## 6. 通知と初回（`features/notification/actions.ts` / `features/first-run/actions.ts`）

- [x] 6.1 `saveNotificationSettings` / `registerSubscription` /
      `unregisterSubscription` / `markGuided` を作った。
      **`markGuided` は `refresh()` を呼ばない**（呼ぶと告知が出た
      瞬間に消える。design D5）。購読の保存/取り消しも呼ばない——
      購読の有無は画面に出ないため
- [x] 6.2 通知の設定と VAPID の公開鍵を props で配った（design D8）。
      `features/notification/queries.ts` を新設し、`DueReviewContainer` が
      `getDue()` と並行に読む。`MemoListContainer` は `vapidPublicKey` を渡す。
      **`notification-settings.tsx` の `loading` と「読み込み中」は消えた**
      （`grep -n "loading" features/notification/components/notification-settings.tsx`
      が空）
- [x] 6.3 `push-subscribe.ts` の `fetch` を `registerSubscription` に置き換えた。
      呼び出し元は 2 か所（設定と初回の告知）のままで、手順は 1 つに保った。
      `push-subscribe.test.ts` は `./actions` を `vi.mock` で差し替えた——
      そこから `lib/db.ts` の `server-only` に辿り着き、node では import した
      時点で throw するため。5 件緑
- [x] 6.4 `first-run-notice.tsx` の 2 つの `fetch` を落とした。公開鍵は props、
      設定の保存は action。`useEffect` ごと消え、`key` は
      `pushSupported() ? vapidPublicKey : null` の派生値になった——
      **扱えない端末では null になり、`offering` が偽になる**（spec `first-run`
      「答える手段が無いときは問いかけない」）。**画面での確認はタスク 10.3**

## 7. Route Handler を消す

- [x] 7.1 `app/api/` を丸ごと削除した（9 ファイル・17 ハンドラ）。
      `ls app/api` → No such file or directory。
      `npm run build` の経路一覧にも `/api/*` は出ない
- [x] 7.2 `/api/` の生きた参照は無い。残る 6 件はすべてコメント
      （「以前はこうだった」の記録）と、`cron.arch.test.ts` が禁じている
      `/api/internal/` の言及
- [x] 7.3 `npm run check` 全通過。`npm run build` 成功。
      **`.next` を消してから建てた**——`next dev` が作った
      `.next/dev/types/validator.ts` が消えたルートを参照したままで、
      `tsc` が落ちていた（生成物なのでリポジトリには影響しない）

## 8. 検査の付け替え

- [x] 8.1 `tests/architecture/auth.arch.test.ts` の走査対象を
      `features/*/actions.ts` に付け替えた（design D9）。4 点とも実装。
      **関数単位で見る**——ファイル単位だと `features/tag/actions.ts`
      （action が 5 つ）で 1 つ消しても他の分に一致して緑のままになる
- [x] 8.2 「Route Handler は残っていない」を足した。
      **これが無いと、走査対象が `actions.ts` だけなので Route Handler を
      足しても誰も見ない**
- [x] 8.3 4 つとも注入し、**狙った検査だけが赤くなることを確かめた**（L06）。
      `unassignTag` から `verifySession()` を消す →「unassignTag は自分で
      セッションを確かめている」／`"use server"` を消す →「"use server" を
      宣言している」／`removeMemo` に `userId: string` を足す →
      「利用者の識別子を引数で受け取っていない」／`app/api/health/route.ts` を
      作る →「Route Handler は残っていない」。いずれも 1 failed | 46 passed。
      退避はスクラッチパッドへ `command cp`（L01）
- [x] 8.4 `npm run harness:review` の受領書が取れた（3 回目）。
      **1 回目は 2 件の指摘で落ちた。** どちらも直した:
      ① `verifySession()` が try の中にあり、未認証時の `redirect()` が投げる
      `NEXT_REDIRECT` を catch が飲み込んでいた（15 の action 全部）。
      セッションの切れた利用者がサインインへ飛ばず「保存できませんでした」を
      見る形で、**design D4 に書いた判断と実装が食い違っていた**。
      try の外へ出し、**検査（`${fn} は try の外でセッションを確かめている`）を
      足して、戻して赤くなることを確かめた**（L06）
      ② `DueReviewContainer` が 2 つの取得を 1 つの try で包んでおり、
      通知の設定が読めないだけで復習の一覧まで空になっていた。
      `Promise.all` の中で個別に `.catch` する形に分けた

      **2 回目も 1 件で落ちた。** `recordGrade` が `recalled: boolean` /
      `occurrenceAt: number` を実行時に確かめておらず、Route Handler にあった
      `typeof` の検査が消えていた。`schedule()` は `if (!outcome.recalled)` と
      truthy で分岐するので、`"false"` のような文字列が届くと**「忘れてた」が
      「覚えてた」として記録される。** 同じ落とし方を
      `acceptTagSuggestion`（配列の形の絞り込み）でもしていた。
      両方戻し、**引数の型に応じた検査を足して、消して赤くなることを
      確かめた**（L06。design D3b）

## 9. 記録と後始末

- [x] 9.1 `CLAUDE.md` の「置き場」に `actions.ts` の行を足した。
      `queries.ts` と対であることと、失敗を戻り値で返すことを書いた。
      `app/` の行から `api/` を外し、**Route Handler は無い**と明記した
- [x] 9.2 クライアントバンドルを前後で測り、design.md に実測値で記録した。
      **827.4 KB → 827.7 KB（+0.04%）で、変わっていない。**
      それぞれ 2 回建てて同じ値になることを確かめた（L13）。
      `fetch` の殻とエラー表が消えたぶんと、Server Action の参照が
      入るぶんが差し引きゼロだった
- [x] 9.3 書き込みのあとの `router.refresh()` は無くなった。
      `server-side-reads` D9 の「途中の形」のコメント 3 か所も消えた。
      **残るのは 2 か所**で、どちらも「書き込みの直後」ではない:
      生成中のポーリング（`memo-screen.tsx`）と、1 回の復習を終えたとき
      （`review-screen.tsx`）。どちらもなぜ残すかをコメントに書いた

## 10. 実機での確認（L10）

ブラウザ枠では確認できない。**確認できていない範囲を明示して人に委ねる。**

- [ ] 10.1 デプロイして iPhone（PWA）で開いてもらう。書き込み 15 経路のうち、
      一度に辿れる主要な 6 つ（メモの保存・削除・タグの付け外し・
      問と答の書き直し・採点・タグの提案）を通す
- [ ] 10.2 **戻る操作でスクロール位置が保たれるか**を見る（design R2）。
      一覧を下までたどってから詳細を開き、戻る。保たれないなら
      `docs/open-issues.md` に残す——**直せなかったことを黙らせない**
- [ ] 10.3 通知の設定を開いて、オン・オフの往復ができること。
      公開鍵が無い環境では差し出しが出ないこと
