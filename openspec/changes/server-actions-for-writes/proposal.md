## Why

前の change（`server-side-reads`）で読み取りは Server Components に移った。
残っているのは**書き込み**で、こちらは手つかずである。いま `app/api/` に
Route Handler が 9 ファイル・17 ハンドラあり、画面はそれを `fetch()` で叩いて
JSON をやり取りしている。

『Next.jsの考え方』第20章「データ操作と Server Actions」は、App Router での
データ操作は Route Handlers ではなく Server Actions で行うことを基本とせよと
言っている。Route Handlers を残す理由として挙げられているのは
**サイト外で起きるデータ操作**（Webhook など）だけで、Remoru の書き込みは
すべてサイト内から起きる。

いまの形が具体的に損をしているのは 3 点。

- **同じ検証を 2 度書いている。** 各ハンドラが `req.json()` を try/catch し、
  型を確かめ、`invalid_json` / `invalid_body` を返す。この 17 ハンドラぶんの
  殻は、Server Actions では引数の型がそのまま届くので丸ごと要らない。
- **エラーの表し方が HTTP に縛られている。** `404` か `400` かをドメインの
  失敗理由から選び直し、画面側で `ERRORS[data.error]` と引き直している。
  第32章「エラーハンドリング」は、Server Functions の**予測可能なエラーは
  戻り値で表す**ことを推奨している。戻り値にすると、失敗の理由が
  `string` ではなくリテラルの union になり、綴り違いと取りこぼしが
  型検査で出るようになる。
- **書き込んだあとの再取得が中途半端。** いまは全部 `router.refresh()` で、
  これは前の change が「次の change で `revalidatePath()` になる途中の形」と
  明記して残したものである（`server-side-reads` D9）。

あわせて、前の change が積み残した **GET 2 本**もここで片づける。どちらも
「画面を開いたときに 1 件読む」たぐいで、Server Components から読めば
Route Handler は要らない。

## What Changes

### 書き込みを Server Actions にする

- `features/<機能>/actions.ts` に `"use server"` の関数を置く。置き場は
  `queries.ts`（読み取りの入口）と対になる
- 各 action は**自分でセッションを確かめる**。Server Actions は公開された
  エンドポイントであり、呼び出し元の画面が確かめたことは担保にならない
- **予測可能な失敗は戻り値で表す**（`{ ok: false, reason: ... }`）。`throw` は
  予測不能な失敗にだけ残す。`throw` すると `error.tsx` が出て、入力中の
  `<form>` の中身が失われる
- 書き込んだあとは action の中で `refresh()`（Next.js 16 の `next/cache`）を
  呼ぶ。画面側の `router.refresh()` は消える

### 残った読み取り 2 本を Server Components へ移す

- `GET /api/memos/[memoId]/quiz-item` → `MemoDetailContainer` が答えを一緒に
  読む。いまは詳細を開いたあと `useEffect` で追いかけて取っており、答えの行と
  鉛筆のボタンが一拍遅れて現れる
- `GET /api/notifications/settings` → 通知の設定と VAPID の公開鍵を、
  `/review` の Container と一覧の Container が props として渡す

### Route Handler を全部消す

- `app/api/` の 9 ファイルを削除する。**このディレクトリが無くなる**
- Webhook もサイト外からの操作も無いので、Route Handlers を残す理由が消える

### 検査を書き込み側に付け直す

- `tests/architecture/auth.arch.test.ts` はいま `app/api/**/route.ts` を
  走査対象にしている。対象が消えると**検査は落ちずに、ただ何も見なくなる**
  （L06）。走査対象を `features/*/actions.ts` に付け替える
- 新しく見るのは 3 つ: `"use server"` を宣言していること、各 action が
  `verifySession()` を通っていること、利用者の識別子を引数で受け取って
  いないこと

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。**この change は利用者から見える振る舞いを変えない。**

書き込みが成功したときに何が起きるか、失敗したときに何が示されるか、入力が
残るかどうかは、いまの spec がすでに定めており（`memo-capture`
「保存に失敗しても入力内容が残る」、`review-session`「記録に失敗しても
採点をやり直せる」、`quiz-editing`「保存に失敗しても入力が残る」ほか）、
**その約束を守ったまま、守り方だけを変える。**

したがって `.openspec.yaml` に `skip_specs: true` を置く。validate を通すために
要件をでっち上げない。

**逆に言えば、この change の合否は「既存の spec のシナリオが全部そのまま
通ること」で決まる。** 消えやすいのは失敗時の見え方なので、そこを重点的に見る
（tasks で列挙する）。

## Impact

**消えるもの**

- `app/api/` 配下 9 ファイル（17 ハンドラ）

**足すもの**

- `features/{memo,quiz,tag,review,notification,first-run}/actions.ts`（6 ファイル）

**触るもの**

- 画面 8 つ: `memo-tab` `memo-detail` `quiz-sheet` `review-tab`
  `tag-suggestion-band` `notification-settings` `first-run-notice`
  `memo-screen`
- Container 2 つ: `memo-detail`（答えを足す）と、通知の設定を渡すための
  `due-review`
- `features/notification/push-subscribe.ts`（`fetch` を action の呼び出しに）
- `tests/architecture/auth.arch.test.ts`

**影響しないもの**

- `cron-worker/`。Next.js の外で動いており、`app/api/` を呼んでいない
- DB スキーマ、ドメイン層（`(db, userId, …)` の純関数）。**1 行も触らない**
- `middleware.ts`。Server Actions は POST として同じ経路を通る

**注意している副作用**

- Server Action の識別子は配備のたびに変わる。古いビルドを掴んだままの
  クライアントが呼ぶと失敗する。Remoru は PWA として端末に居座るので、
  いまの `fetch` より起きやすい（design R2b）
- Server Actions の呼び出しは**直列化される**。Remoru の書き込みは利用者の
  1 操作 = 1 回なので問題になる想定は無いが、確かめずに断定はしない
