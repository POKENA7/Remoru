## Context

書き込みの Route Handler（2026-09-12 時点、`app/api/`）:

| 経路 | 何 | ドメイン関数 |
|---|---|---|
| `POST /api/memos` | 保存 + 生成の開始 | `createMemo` `startGeneration` |
| `PATCH/DELETE /api/memos/[id]` | 本文の編集・削除 | `features/memo` |
| `PUT /api/memos/[id]/quiz-item` | 問答の書き直し | `features/quiz` |
| `POST/DELETE /api/memos/[id]/tag` | タグの付け外し | `features/tag` |
| `POST /api/review/[quizItemId]` | 採点 | `features/review` |
| `POST /api/first-run` | 導きの記録 | `features/first-run` |
| `PUT /api/notifications/settings` | 通知設定 | `features/notification` |
| `POST/DELETE /api/notifications/subscription` | 購読 | `features/notification` |
| `POST /api/tags/suggestion` | タグの提案（モデル呼び出し） | `features/tag` |

各 Handler は「`getCurrentUserId()` → 401 / `req.json()` の検証 / `getDb()` / `Date.now()` /
ドメイン関数 / JSON」の同じ形。`startGeneration` は `getDeferrer()`（`ctx.waitUntil`）で
応答後も生成を続ける。

`queries.ts` の形（`server-side-reads` D8）: `server-only` + `cache()` + `verifySession()` → `getDb()` → ドメイン関数。
`lib/request-clock.ts` が「いま」をリクエストに 1 つにする。

`memo-capture` spec: 「反映の演出が保存そのものを遅らせては MUST NOT ならない。行は直ちに現れ、
演出はその上で起こる」。いまは応答後に `onSaved(memo.id)` → 刷り。

## Goals / Non-Goals

**Goals:**

- 書き込みの入口を `actions.ts` に集約し、Route Handler を無くす
- メモの保存が押した瞬間に見える
- 書き込み後の更新が `revalidatePath()` で必要な経路だけ

**Non-Goals:**

- 生成の方式の変更。ポーリングの変更

## Decisions

### D1: `actions.ts` は `queries.ts` と同じ規律。返り値は投げない

```ts
"use server";
import "server-only";

export async function saveMemo(prev: State, form: FormData): Promise<State> {
  const userId = await verifySession();
  const db = await getDb();
  const now = requestNow();
  const result = await createMemo(db, { content: String(form.get("content") ?? ""), now, userId });
  if (!result.ok) return { error: result.error };
  await startGeneration(db, { memoId: result.memo.id, userId, now, apiKey: process.env.ANTHROPIC_API_KEY, defer: await getDeferrer() });
  revalidatePath("/");
  return { ok: true, memoId: result.memo.id };
}
```

- **期待される失敗は値で返す。** throw は `error.tsx` に行き、入力欄の内容が失われる
  （`memo-capture`「保存に失敗しても入力内容が残る」）
- **入力の検証はドメイン関数の仕事のまま。** Action は `FormData` を文字列にするだけ
- `verifySession()` は未認証で `redirect()` する。Action の中の `redirect()` は Next が扱う
- `revalidatePath()` は書いたものが出る経路だけ。保存なら `/`、採点なら `/review` と `/record`

### D2: 構造の検査 `lib/action-boundary.test.ts`

`query-boundary.test.ts` と同じ形で `actions.ts` を読む:

- 先頭に `"use server"`、`import "server-only"` がある
- export される関数はすべて `verifySession()` を呼ぶ
- `Date.now()` を直に読まない（`request-clock` 経由）
- `revalidatePath` か `revalidateTag` を少なくとも 1 回呼ぶ（呼ばない書き込みは画面が古いまま）
- `cron-worker` が `actions.ts` を import しない（`layer-boundary` の規則 4 に含まれる。ここでは見ない）

4 種の違反を注入して赤を確かめる（L06）。

### D3: メモの保存は `useActionState` + `useOptimistic`

```
押す → useOptimistic で一覧の先頭に仮の行（review: generating、tags: []）→ 刷りの演出
     → Action が返る → revalidatePath で本物の行に入れ替わる（同じ id なら演出は再実行しない）
失敗 → 仮の行を消し、本文を入力欄に戻し、エラーを操作した場所に出す
```

**刷りの演出の合図は仮の行の出現。** いまは応答後の `onSaved(memo.id)` だが、id は応答まで
分からない。仮の行には一時 id（`optimistic-<time>`）を付け、`fresh` の同一性はその一時 id で保つ。
本物の行に入れ替わったとき、**もう一度刷らない**——`fresh` は一時 id を指しており、本物の id とは
一致しないので、自然に再実行されない。これを検査で固定する（保存後に刷りが 1 回だけ起きる）。

**下書きの保持**（`server-side-reads` D3、`sessionStorage`）は Action の成功時に消す。
失敗時は残す。

### D4: `startGeneration` の `ctx.waitUntil` は Action でも取れることを最初に確かめる

`getDeferrer()` は `getCloudflareContext({ async: true })` から `ctx.waitUntil` を取る。
Server Action は OpenNext 上では同じ Workers のリクエストの中で動くので取れるはずだが、
**確かめるまで分からない。** タスクの最初に、Action から保存 → staging で問答が生成されることを
見る（`ANTHROPIC_API_KEY` を staging に一時的に入れる）。取れなければこの change は保存の Action を
後回しにし、他の書き込みから進める。代替設計は別 change。

### D5: Route Handler は 1 本ずつ消す。消す前に E2E と手動が通る

順序（依存が少ないものから）:

1. `first-run` → 2. `review`（採点）→ 3. `tag`（付け外し）→ 4. `memos/[id]`（編集・削除）→
5. `quiz-item` → 6. `notifications`（設定・購読）→ 7. `tags/suggestion` → 8. `memos`（保存。D4 の答えの後）

各段: Action を書く → 画面を Action に切り替える → `next dev` で操作を通す → Handler を消す →
`npm run check`。**Handler を残したまま Action を足すと、どちらが使われているか分からなくなる**ので、
段ごとに消す。

購読（`subscription`）は `PushSubscription` の JSON を Action の引数で受ける。`DELETE` の応答を
見ずに端末側を解除している欠陥（`docs/open-issues.md` 付随の小さな欠陥）は、**この移行で直さない**。
別の問題を混ぜない。ただし Action の返り値で「消せなかった」を返せる形にはしておく。

### D6: ポーリングは `router.refresh()` のまま

生成中のメモがある間だけ 2 秒間隔で `router.refresh()`（`server-side-reads` が
`load()` から置き換えたもの）。この change では触らない。`revalidatePath()` は書き込みの
直後だけで、生成の完了は Action の外で起きるため、ポーリングが要る構造は変わらない。

### D7: `enforce-layer-boundaries` の許容リストを空にする

`app/api/` が消えた時点で `ALLOWED_DB_IMPORTS_IN_APP` を `[]` にする。`app/**` が `lib/db` を
import する経路が 0 本になる。

## Risks / Trade-offs

- **楽観的な行と本物の行の入れ替わりで一覧が跳ねる** → 仮の行の高さは本文で決まるので、本物と同じ。
  タグと復習状態の表示が変わる（`generating` は本物も同じ）。目で確かめる（L05）
- **Server Action の引数は直列化される。** `FormData` と JSON 化できる値だけ → 購読は JSON にしてから渡す
- **`revalidatePath()` の呼び忘れ** → D2 の検査で止める
- **9 本を一度に消して壊れる** → D5 の段階的な順序。段ごとに `check` と E2E

## Open Questions

- D4（`waitUntil` が Action で取れるか）。最初のタスクで答えを出す
- 楽観的な行の見た目（タグ無し・「作成中」）が現状の行と違って見えるか。モックで見せる（L11）
