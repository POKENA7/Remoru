## Context

- `next dev` は `initOpenNextCloudflareForDev()` でローカルの D1（`.wrangler/state`）を使う。
  `npm run db:migrate:local` を先に当てる必要がある
- `next dev` は `.env.local` を読む。Clerk の鍵はそこにある。**CI には無い**
- Clerk の Testing Tokens（`@clerk/testing`）: `clerkSetup()` が `CLERK_SECRET_KEY` から
  トークンを取り、`setupClerkTestingToken()` がボット検出を外す。サインインは
  `clerk.signIn({ strategy: "password", identifier, password })`。`storageState` に保存して使い回す
  （`clerk-testing` skill。詳細は Clerk の Playwright 文書を実装時に読む）
- `ANTHROPIC_API_KEY` が無いと生成は起きず、メモは「未作成」のまま残る。これは仕様
  （`docs/deploy.md`「鍵が無くてもアプリは壊れない」）
- Stop hook は `check:test` を毎ターン走らせる（9.6 秒）。E2E をそこに入れると `next dev` の
  起動込みで桁が変わる

## Goals / Non-Goals

**Goals:**

- 利用者の 1 本の流れが通ることを、CI と手元で機械が確かめる
- これから経路と取得の方式が変わっても、**書き直さずに済む**テストにする

**Non-Goals:**

- 網羅。視覚回帰。性能

## Decisions

### D1: 1 本のシナリオ。spec の言葉で書く

```
サインインする
メモを 1 件書く（本文は "e2e " + 時刻。既存データと衝突しない）
一覧の先頭にその本文が出る
その行を押して詳細を開く。本文が見える
戻る。一覧に同じ本文がまだある
復習タブを押す。復習の画面が出る（出題が無いときの案内でもよい）
```

各段は `memo-capture` `navigation` の spec のシナリオに対応する。**対応する spec の
Requirement 名をテストのコメントに書く**。spec が変わったときにテストを探せる。

### D2: 場所は role と label で取る。構造・クラス名・URL に依存しない

```ts
page.getByRole("textbox", { name: /メモ/ })
page.getByRole("button",  { name: "保存" })
page.getByRole("tab",     { name: "復習" })
page.getByRole("listitem").filter({ hasText: body })
```

`stream-route-boundaries` で読み込み中の枠が入り、`move-client-boundary-to-leaves` で部品が割れ、
`optimistic-memo-save` で保存の見え方が変わる。**利用者から見える名前**だけに依存
していれば、どれも書き直しにならない。URL の断言は `tests/architecture/navigation.arch.test.ts` に任せ、ここでは書かない。

**戻る操作は `page.goBack()`。** 経路は `server-side-reads`（archive 済み）で分かれているので、
詳細（`/memos/<id>`）から `goBack()` で一覧へ戻る。`navigation` spec「戻る操作は直前に見ていた
画面へ返す」に対応する。**`?tag=` の絞り込みが戻ったあとも残ること**（`memo-capture`、実機で一度
壊れた箇所）を、絞り込んでから詳細を開く順で 1 段足す。

### D3: 認証は `global-setup` で 1 回。`storageState` で使い回す

`e2e/global-setup.ts` が `clerkSetup()` → ブラウザでサインイン → `storageState` を保存。
各テストはその状態で始まる。UI からのサインインを毎回やらない（遅く、Clerk の UI 変更で壊れる）。

テスト用の利用者は Clerk の開発インスタンスに**専用に**作る。資格情報は
`E2E_CLERK_USER_EMAIL` `E2E_CLERK_USER_PASSWORD`。手元は `.env.local`（gitignore 済み）、
CI は GitHub Environment `e2e` の secret。

### D4: `check:e2e` は `check` に入れない。CI は別ジョブ

```
check:e2e = playwright test        （playwright.config の webServer が next dev を起動）
```

`ci.yml` に `e2e` ジョブを足す。`check` ジョブとは独立に走る（`check` の結果を待たない。
待つと E2E の失敗が遅れて見える）。secret が無い実行（fork からの PR）では
`if: ${{ secrets.E2E_CLERK_USER_EMAIL != '' }}` 相当で**飛ばし、飛ばしたことをログに出す**。
静かに緑にしない。

コミット前の門（`precommit-gate`）には入れない。`check` の所要が分単位になり、
門そのものが外される（`add-deterministic-harness` の制約 4 と同じ理由）。

### D5: 検査が検査であることを確かめる（L06）

保存の Server Action をわざと失敗させて E2E が赤くなること、
戻して緑になることを 1 度確かめ、tasks に記録する。継続的な注入テストは書かない
（E2E の中で E2E を壊す構造は複雑すぎる）。

### D6: ローカル D1 は使い捨て。テストの後始末はしない

`next dev` のローカル D1 に E2E のメモが溜まる。本文に "e2e" と時刻が入っているので
見分けがつく。消す仕組みは作らない。CI は毎回まっさら。

## Risks / Trade-offs

- **`next dev` の起動が遅く、CI の E2E が数分かかる** → 許容する。`check` とは別ジョブなので
  型・テストの結果は先に返る
- **Clerk の Testing Tokens が開発インスタンスの設定で無効** → タスク 1.3 で最初に確かめる。
  使えなければ UI からのサインインに切り替え、design に記録する
- **`getByRole` で取れる名前が無い要素がある**（`aria-label` の無いボタンなど） → その場合は
  **製品側に label を足す**。テストのために構造依存にしない。a11y の改善でもある

## Open Questions

- `next dev` を Playwright の `webServer` から起動したとき、`initOpenNextCloudflareForDev()` の
  ローカル D1 が同じ `.wrangler/state` を指すか（手元の `npm run dev` と同じ場所）。実装時に確かめる
