## 1. 基盤

- [x] 1.1 `import_tokens` の表を `db/schema.ts` に足す (持ち主、ハッシュ、名前、発行時刻、失効時刻)。マイグレーションを作る (design D2)。検証: `drizzle/migrations/0009_classy_cloak.sql`
- [x] 1.2 `import_rate_limits` の表を足す (トークン、1分の区切り、回数)。マイグレーションを作る (design D6)。検証: 同じマイグレーション
- [x] 1.3 `features/import/import-tokens.ts` にトークンのドメインを置く。発行、失効、一覧、ハッシュの照合を `(db, userId, …)` の純関数として書く (design D2・D3)。`lib/` には置かない。検証: 平文を保存しないこと、接頭辞で落とすことをテストで確認
- [x] 1.4 1.3のテストを書く。失効済みトークンの拒否と、他人のトークンへの到達不能を含む。検証: `features/import/import-tokens.test.ts` 17件

## 2. 取り込みAPIの登録

- [x] 2.1 `features/import/request-context.ts` に、要求からトークンを読んで持ち主の利用者とデータベースと `defer` を返す入口を置く。`actions.ts` には置かない (Server Action ではない)。`app/**` が `lib/db` を import しない形にする (design D3)
- [x] 2.2 `app/api/memos/route.ts` に `POST` を作る。配列の受け付け、件単位の結果、1回20件の上限、件ごとの `createMemo` と `startGeneration` の再利用 (design D1・D4・D5)
- [x] 2.3 1.2の表を使う速度の制限を付ける。1分あたり60回を超えたら429を返す (design D6)。検証: 60回目まで通り61回目が429になること、次の1分で戻ることをテストで確認
- [x] 2.4 2.1から2.3のテストを書く。部分成功、全体拒否 (401)、件数の上限超過、回数の上限超過を含む。検証: `import-api.test.ts` 20件、`import-rate-limit.test.ts` 4件

## 3. 取り込みAPIの読み取りとトークンの画面

- [x] 3.1 `app/api/memos/route.ts` に `GET` を足す。あわせて `app/api/memos/[id]/route.ts` と `app/api/tags/route.ts` を作る。一覧のContainerと同じ3つの取得を使い、持ち主で絞る。応答から `userId` を外す (design D4)
- [x] 3.2 `listMemos` に任意の件数上限を足す。既存の呼び出しを変えない (design D4)。検証: `memos.test.ts` に上限の2件を追加
- [x] 3.3 `features/import/actions.ts` に発行と失効の Server Action を置き、メモ画面の上部に入口を足して、共通の `Sheet` で発行と失効を示す。平文は発行時に一度だけ示す (design D10、spec「発行と失効」)。検証: ローカルの Workers で発行・失効・平文の表示を実機確認（下の 6.2 と同じ往復）
- [x] 3.4 3.1から3.3のテストを書く。他人のメモの区別不能、タグの持ち主絞りを含む。検証: `import-read.test.ts` 9件、`import-auth.test.ts` 5件、`import-tokens.test.ts` 18件。**画面（3.3）の自動テストは無い**——DOM のテスト環境をこのリポジトリは持たず、`Sheet` の作法は `sheet.arch.test.ts` が見る

## 4. 検査と文書の更新

- [x] 4.1 `tests/architecture/auth.arch.test.ts` の「Route Handler は残っていない」を、「`app/api` の各経路が自分でトークンを確かめている」に置き換える (design D3)。検証: `tags/route.ts` の呼び出しを別名に差し替えて赤くなることを確認 (L06)
- [x] 4.2 `docs/nextjs-rework-plan.md` の「`app/api` は無い」の記述 (76行目と138行目) を更新する (design D3)。あわせて `docs/deploy.md` にマイグレーションの適用を足す
- [x] 4.3 `npm run check` を通す。`check:types` と `check:test` が CLI を含むことを確かめる (design D7)。検証: `npm run check` が緑。`check:bundle` は 207.4 KB（予算 216.5 KB）

## 5. CLI

- [x] 5.1 `cli/` に独自の `package.json` と `tsconfig.json` を置く。`check:types` の対象に加える (design D7)。検証: `npm --prefix cli run typecheck` が通る
- [x] 5.2 `login` と `logout` を作る。トークンを `~/.config/remoru/` に置く (design D7)。検証: `store.test.ts` 6件（0600 で置くことを含む）
- [x] 5.3 `memo add` を作る。引数での1件、`-f` での複数件 (空行区切り)、`--dry-run` での候補表示 (design D8)。検証: `node cli/remoru.ts memo add -f /tmp/notes.md --dry-run` が3件を表示
- [x] 5.4 `memo list`、`memo show`、`tag list` を作る。`--tag` と `--limit` と `--json` を含む (design D8)
- [x] 5.5 5.2から5.4のテストを書く。引数の分割、検証落ちの表示、終了コードを含む。検証: `cli/args.test.ts` 20件、`cli/api.test.ts` 12件、`cli/output.test.ts` 14件

## 6. SKILLと締め

- [x] 6.1 `.claude/skills/remoru/SKILL.md` を書く。起動条件、分け方の規則、`--dry-run` から確認を経て確定する順序 (design D9)
- [x] 6.2 実際の調査結果を使い、要約から登録と一覧の確認までの往復を通す (design D1・D8)。検証: `npm run preview`（Workers ランタイム）とローカルの D1 に対して `memo add` `memo list` `memo show` `tag list` を通した。401（トークン無し・不正・失効後）、21件の400、存在しない id の404 も実測
