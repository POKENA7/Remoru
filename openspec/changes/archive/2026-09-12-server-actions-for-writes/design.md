## Context

動機は proposal.md の Why。ここでは設計に効く現状だけ書く。

- 読み取りはすでに Server Components にある。`features/<機能>/queries.ts` が
  `server-only` + `cache()` + `verifySession()` の 3 点を持つ入口で、
  ドメイン層は `(db, userId, …)` を受け取る純関数のまま
- 書き込みは `app/api/` の 9 ファイル・17 ハンドラ。画面は `fetch()` で叩き、
  失敗は `res.ok` と `data.error` で判断している
- **`error.tsx` はまだ置いていない**（次の change）。いま Server Components が
  throw すると Next.js の既定のエラー画面になる
- Data Cache も Full Route Cache も効いていない。D1 への問い合わせは Drizzle
  経由で `fetch` を通らず、`verifySession()` が Cookie を読むので全経路が動的
- OpenNext Cloudflare。Server Actions は Route Handlers と同じく Workers 上で動く
- 詳細画面（`memo-detail.tsx`）は本文・タグ・復習状態・答えを**ローカルに写して
  持っている**。これは画面が経路を持たなかった頃の対処である

## Goals / Non-Goals

**Goals:**

- 書き込みを Server Actions に移し、`app/api/` を無くす
- 予測可能な失敗を戻り値で表し、いまの spec が定める「失敗を操作した場所で示し、
  入力を失わせない」を**そのまま保つ**
- 積み残しの GET 2 本を Server Components の取得に移す
- 検査の走査対象を書き込み側へ付け替える（対象が消えても気づけるように）

**Non-Goals:**

- `error.tsx` / `loading.tsx` / `<Suspense>` を置くこと。次の change
- 詳細画面のローカル写し（本文・タグ・復習状態）の設計見直し。この change が
  触るのは**答え**だけ
- 通知設定をシートとして出し直すこと（`server-side-reads` の 3.8）。渡し方は
  変えるが、見た目と開き方は変えない
- キャッシュ。適用範囲外と決めてある
- JavaScript 非動作環境の支援を**約束すること**。`<form action>` にすれば
  付いてくるが、確かめる手立てが無いので謳わない

## Decisions

### D1: 置き場は `features/<機能>/actions.ts`

`queries.ts`（読み取りの入口）と対にする。ファイル先頭に `"use server"` を置く。

```
features/memo/
  memos.ts        ドメイン。(db, userId, …) の純関数
  queries.ts      読み取りの入口。server-only + cache() + verifySession()
  actions.ts      書き込みの入口。"use server" + verifySession() + revalidate
```

**却下した案: `app/(app)/_actions/` に置く。** Container を `_containers/` に
置いたのと揃うが、書き込みは経路ではなく機能に属する。同じ `setTag` を
一覧からもタグの提案からも呼ぶ。

**`"use server"` のファイルから export したものは全部が公開エンドポイントになる。**
ヘルパを置くときは export しない。

### D2: `<form>` があるところだけ `useActionState`、ほかは型付き引数で直に呼ぶ

| 操作 | 形 | 理由 |
|---|---|---|
| メモの保存 | `<form action={...}>` + `useActionState` | textarea 1 つの form が既にある |
| 問と答の書き直し | 同上 | 3 欄の form が既にある |
| それ以外 12 個 | 型付き引数の action を `await` | ボタン 1 つで起きる。form が無い |

「それ以外」は削除・タグの付け外し・採点・提案の取得/承認/見送り・通知の
オンオフ・購読の保存/取り消し・初回の記録。

**すべてを `FormData` に寄せない。** 採点は `recalled: boolean` と
`occurrenceAt: number` を運ぶ。文字列に潰して読み直すと、型で守れていた
ところが実行時の検証に戻る。Server Actions の引数は React が serialize
できるものなら何でもよいので、潰す理由が無い。

**`<form>` がある 2 つを `useActionState` にする**のは、入力の保持と
「送信中」の表示が `<form>` 側に寄るためである。

**ただし action は生のまま渡さない。** `useActionState` に渡した関数が throw
すると、React はそれを描画時に投げ直し、最も近い error boundary が受ける。
action の中の失敗は戻り値にできるが（D4）、**action に辿り着けない失敗**
——圏外、配備で識別子が変わったあとの呼び出し（R2b）——は throw で届く。
そのまま渡すと、通信が切れただけで入力中の本文が画面ごと消える。

そこでクライアント側の薄い関数で包み、catch を戻り値に変えて `useActionState`
へ渡す。**代償は JavaScript 未読込での submit が効かなくなること**だが、
これは Non-Goals に置いたとおり最初から約束していない。第20章が
progressive enhancement を利点として挙げているのは事実だが、spec が求める
「失敗しても入力が残る」と両立しないので、spec を採る。

### D3: 失敗は「機械が読む語」で返し、文言は画面が持つ

```ts
export type SaveMemoResult =
  | { ok: true; memoId: string }
  | { ok: false; reason: "empty" | "too_long" | "failed" };
```

いまも画面側に `ERRORS: Record<string, string>` の表があり、`data.error` で
引いている。**この引き直しは残す。** 変わるのは、キーが `string` ではなく
リテラルの union になることで、綴り違いと取りこぼしが型検査で出るようになる。

**却下した案: action が日本語の文言を返す。** 文言のトーンは
`docs/design-decisions.md` が決めており、表示の関心である。ドメインの語彙を
画面の語彙に翻訳する場所は画面側に残す。

### D3b: 引数は実行時に確かめる。**型注釈は実行時に消える**

Server Action の引数に型が付いたからといって、Route Handler にあった
`typeof` の検査が要らなくなったわけではない。**消えたのは検査ではなく、
「ここは要求の本文だ」という見た目だけである。** 公開された POST の宛先なので、
画面を経由しない呼び出しでは宣言と違う値が届く。

最初の実装は 3 か所でこれを落としており、レビューで指摘された。**いちばん
危ないのは `recordGrade(quizItemId, recalled: boolean, occurrenceAt: number)`**
で、`review-scheduler.ts` の `schedule()` が `if (!outcome.recalled)` と
truthy で分岐するため、`"false"` のような空でない文字列が届くと
**「忘れてた」が「覚えてた」として記録され、復習の間隔が静かに壊れる。**
型でも実行でも出ない。

したがって `auth.arch.test.ts` で見る。

- 引数そのものが `boolean` / `number` → `typeof` か `Number.isFinite` で確かめる
- 引数がオブジェクトか配列 → `validate…()` に通すか `Array.isArray` で閉じる
- 文字列は見ない。ドメイン側の検証が `.trim()` などで throw し、`catch` が
  失敗に倒すため（それでも各 action で確かめてはいる）

### D4: 想定外の失敗も戻り値に落とす。action から throw しない

**これは spec を守るために要る。** `memo-capture`「保存に失敗しても入力内容が
残る」ほか複数の要件が「失敗を**操作した場所で**示し、再実行できる状態を保つ」
と言っている。Server Action が throw すると、その要求は `error.tsx`（まだ無い
ので既定のエラー画面）へ吸われ、入力中の内容ごと画面が差し替わる。

したがって各 action は本体を try/catch で包み、想定外も `{ ok: false,
reason: "failed" }` にする。**いまの `fetch` の呼び出し側が全部 try/catch を
持っているのと同じ守り**を、サーバー側へ移すだけである。

例外は認証の失敗で、これは `verifySession()` の `redirect()` に任せる
（セッションが切れたら入り直させるのが正しい）。

**そのため `verifySession()` は try の外で呼ぶ。** `redirect()` は
`NEXT_REDIRECT` を投げることで働くので、try の中で呼ぶと catch がそれを
飲み込み、**サインインへ飛ばずにただの失敗になる。** 最初の実装は 15 の
action すべてで中に入れており、レビューで指摘されるまで気づかなかった。
型でも実行でも出ないので、`auth.arch.test.ts` の検査にした。

**呼ぶ側の try/catch も残す。** action の中の失敗は戻り値になるが、
**action に辿り着けない失敗**は戻り値にならない——圏外と、配備で識別子が
変わったあとの呼び出し（R2b）である。どちらも呼び出し側に throw で届くので、
画面側の catch は消さない。`useActionState` を使う 2 か所は React が捕まえる
ので、そちらは形が違う。

### D5: 再検証ではなく `refresh()` を呼ぶ

書き込む action は `next/cache` の `refresh()` を呼ぶ。**`revalidatePath()` は
使わない。**

Next.js 16 は書き込み後の更新手段を 4 つ持っている。

| | 何をするか | Remoru に合うか |
|---|---|---|
| `updateTag` / `revalidateTag` | タグ付きキャッシュを失効させる | タグを付けていない |
| `revalidatePath` | 経路のキャッシュを失効させる。**Router Cache を全部捨てる** | 捨てるものが無いのに捨てる |
| `refresh` | いまの経路の RSC Payload を取り直す。**キャッシュは触らない** | これ |

**Remoru にはサーバー側で捨てるものが無い。** D1 への問い合わせは Drizzle
経由で `fetch` を通らないので Data Cache に載らず、`verifySession()` が Cookie を
読むので全経路が動的、つまり Full Route Cache も無い。`revalidatePath()` を
呼んで得られるのは「クライアントの Router Cache が全部消える」という**損だけ**
である（『Next.jsの考え方』第20章がトレードオフとして挙げている、戻る操作で
スクロール位置が復元されなくなる件はこれが原因）。

`refresh()` は現在の経路をサーバー側で描き直し、その結果を action の応答に
同梱する。レイアウトも描き直されるので、**下部タブの復習の件数も一緒に更新
される**。これはいままで `router.refresh()` がやっていたことと同じで、
違いは「クライアントが往復を1つ増やさない」ことだけである。

**ラッパーを置かない。** 引数が無いので、包んでも何も決められない。
`import { refresh } from "next/cache"` を各 `actions.ts` が直接呼ぶ。

**呼ばない action が 3 つある。**

- タグの提案の取得（`requestTagSuggestion`）。DB を変えない
- 初回の記録（`markGuided`）。呼ぶと告知が出た瞬間に消える
- **採点（`recordGrade`）。** 復習は 1 枚ずつ進むので、採点のたびに描き直すと
  画面が持つ `items` が 1 件ずつ縮む一方で「何枚目か」は進み、**カードが 1 枚
  飛ぶ**。取り直すのは 1 回の復習が終わったとき（またはやめたとき）で、
  その契機は画面が持っている

最後の 1 つのために、**`router.refresh()` が 2 か所だけ残る**——復習を終えた
ときと、生成中のメモを待つポーリングである。どちらも「書き込みの直後」ではなく
**画面が「いま取り直したい」と判断する場面**で、対応する action が無い。
`router.refresh()` はそのための道具なので、残すのが正しい。

### D6: 認可は action ごとに `verifySession()`

Server Actions は**公開されたエンドポイント**である。呼び出し元の画面が
認証済みであることは、その action が認証済みの呼び出ししか受けない担保に
ならない。読み取りの入口と同じ関数を使う。

第31章「認証と認可」が言う「データアクセス認可はデータフェッチ層で」の
書き込み版にあたる。ページとレイアウトが並行にレンダリングされる話は
読み取り側の議論だが、**資源の側で確かめる**という結論は同じである。

### D7: 答えは Container が読む

`features/quiz/queries.ts` に `getQuizItem(memoId)` を足し、
`MemoDetailContainer` が `Promise.all` に加える。`memo-detail.tsx` の
`answer` は `useState<string|null>(null)` + `useEffect` の取得をやめ、
props で受ける。

いまは詳細を開いてから追いかけて取っているので、**答えの行と鉛筆のボタンが
一拍遅れて現れる**（鉛筆は `answer === null` の間 disabled）。サーバーで
読めば最初の描画から揃う。

書き直したあとの更新は、いまと同じくローカルの写し（`setAnswer`）が担う。
**再検証で届く新しい props はローカルの写しに負ける**が、これは今の
`router.refresh()` でも同じで、この change で新しく生まれる問題ではない。

### D8: 通知の設定と VAPID の公開鍵は props で配る

- `/review` の Container が `getNotificationSettings()` を読み、
  `ReviewScreen` 経由で `NotificationSettings` に渡す
- 一覧の Container は `vapidPublicKey` だけを `MemoScreen` 経由で
  `FirstRunNotice` に渡す（差し出せるかどうかの判断に要る）

公開鍵は名前のとおり公開してよい値で、いまも GET の応答に載っている。
ビルド時に埋め込まず `process.env` から読む形は変えない（本番では
`wrangler secret` で差し替える）。

**却下した案: 設定を開いたときに Server Function で読む**（第9章の形）。
読むものが「利用者ごとに 1 行」しかなく、`/review` はもう 1 回 DB を読んで
いる。1 本増やして並行に走らせるほうが、開いてから待たせるより速い。

### D9: 検査は `features/*/actions.ts` を走査する

`auth.arch.test.ts` はいま `app/api/**/route.ts` を集めている。**対象が
消えても、この検査は落ちない。ただ何も見なくなる**（L06）。

付け替えて、次の 4 つを見る。

1. 走査対象が空でない（0 件で緑にならないように）
2. 各 `actions.ts` が `"use server"` を宣言している
3. export される各 action が `verifySession()` を通っている
4. 利用者の識別子を引数で受け取っていない（`userId` という引数を禁じる）

加えて **`app/api/` が存在しないこと**を見る。Route Handler が戻ってきたら
気づくため。Webhook などで必要になったら、そのときこの検査を直す。

**この検査は、違反を 1 つ注入して赤くなることを確かめてから採用する**（L06）。

## Risks / Trade-offs

**[R1] action が throw すると入力ごと画面が飛ぶ** → D4。全 action を try/catch で
包み、想定外も戻り値にする。検査ではなく実際の失敗経路で確かめる（tasks 5）

**[R2] `refresh()` は Server Actions の中でしか呼べない** → Route Handler や
Client Components から呼ぶと throw する。この change では書き込みが全部 action に
移るので該当しないが、**検査では捕まえられない**（型では区別が付かない）。
`app/api/` が消えることが実質の担保になる

**[R2b] 配備のたびに action の ID が変わる** → 古いビルドを掴んだままの
クライアントが呼ぶと "Failed to find Server Action" になる。Remoru は PWA として
端末に居座るので、**いまの `fetch` より起きやすい**。ただし 15 経路すべてが
「押したら失敗が出て、押し直せる」形なので、利用者から見れば一度の失敗で済む。
実機で当たったら open-issues に残す

**[R3] `"use server"` のファイルから export したものが全部エンドポイントになる**
→ ヘルパは export しない。D9 の検査 3 が「export される全部が
`verifySession()` を通る」を見るので、うっかり公開したヘルパは赤くなる

**[R4] Server Actions は直列化される**（第20章）→ Remoru の書き込みは利用者の
1 操作につき 1 回で、連打は各画面の `busy` / `grading` が止めている。
問題になる想定は無いが、**測っていないので断定しない**

**[R5] 一度に触る画面が 8 つある** → 機能ごとに区切って進め、区切りごとに
`npm run check` を通す。tasks を機能単位で並べる

## Migration Plan

1 つの change で全部を移す。**片方だけ残す期間を作らない。**

Route Handler と action の両方が同じ書き込みへの入口になっている状態は、
認可の穴が二重になる（片方の検査を直して、もう片方を忘れる）。9 ファイルは
どれも薄い殻で、機械的に移せる。

戻すときはこの change のコミットを revert する。DB スキーマもドメイン層も
触らないので、データの移行や巻き戻しは無い。

## 実測: クライアントバンドル

`main`（`bc3256d`）と変更後を、それぞれ `.next` を消してから `next build` し、
`.next/static/chunks/*.js` の合計バイト数で比べた。前の change と同じ手順・
同じ機械。**それぞれ 2 回建てて、同じ値になることを確かめてある**（L13）。

| | 合計 | チャンク数 |
|---|---|---|
| 変更前（main） | 827.4 KB | 17 |
| 変更後 | 827.7 KB | 17 |

**変わっていない。** 0.3 KB（+0.04%）で、丸めの幅である。

減ると見込んでいたわけではないが、増えてもいない。`fetch` の殻と
`Record<string, string>` のエラー表が消えた一方、Server Action の参照
（action の識別子と dispatcher）がクライアントに入る。**差し引きゼロだった。**

Route Handler が 9 ファイル消えたことはこの数字に出ない。Route Handler は
もともとサーバー側だけのもので、クライアントのチャンクを作らない。

## Open Questions

- ~~**戻る操作でスクロール位置が保たれるか。**~~ 実機で確認してもらい、
  **問題は出なかった**（tasks 10.2）。D5 で `revalidatePath()` ではなく
  `refresh()` を選んだので、Router Cache を捨てる経路がそもそも無い。
  **R2 で懸念した損は、設計の時点で消えていた。**
- ~~**クライアントバンドルがどう動くか。**~~ 測った（上の「実測」）。
  **変わらなかった**（+0.04%）
