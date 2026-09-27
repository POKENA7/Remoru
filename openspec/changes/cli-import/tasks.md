## 1. 基盤

- [x] 1.1 `import_tokens` の表を `db/schema.ts` に足す (持ち主、ハッシュ、名前、発行時刻、失効時刻)。マイグレーションを作る (design D2)。検証: `drizzle/migrations/0009_classy_cloak.sql`。（レビューを受けて 7.1 で置き換える）
- [x] 1.2 `import_rate_limits` の表を足す (トークン、1分の区切り、回数)。マイグレーションを作る (design D6)。検証: 同じマイグレーション。（レビューを受けて 7.1 で置き換える）
- [x] 1.3 `features/import/import-tokens.ts` にトークンのドメインを置く。発行、失効、一覧、ハッシュの照合を `(db, userId, …)` の純関数として書く (design D2・D3)。`lib/` には置かない。検証: 平文を保存しないこと、接頭辞で落とすことをテストで確認。（レビューを受けて 7.2 で置き換える）
- [x] 1.4 1.3のテストを書く。失効済みトークンの拒否と、他人のトークンへの到達不能を含む。検証: `features/import/import-tokens.test.ts` 17件。（レビューを受けて 7.2 で置き換える）

## 2. 取り込みAPIの登録

- [x] 2.1 `features/import/request-context.ts` に、要求からトークンを読んで持ち主の利用者とデータベースと `defer` を返す入口を置く。`actions.ts` には置かない (Server Action ではない)。`app/**` が `lib/db` を import しない形にする (design D3)
- [x] 2.2 `app/api/memos/route.ts` に `POST` を作る。配列の受け付け、件単位の結果、1回20件の上限、件ごとの `createMemo` と `startGeneration` の再利用 (design D1・D4・D5)
- [x] 2.3 1.2の表を使う速度の制限を付ける。1分あたり60回を超えたら429を返す (design D6)。検証: 60回目まで通り61回目が429になること、次の1分で戻ることをテストで確認。（レビューを受けて 7.3・7.4 で置き換える）
- [x] 2.4 2.1から2.3のテストを書く。部分成功、全体拒否 (401)、件数の上限超過、回数の上限超過を含む。検証: `import-api.test.ts` 20件、`import-rate-limit.test.ts` 4件。（レビューを受けて 7.3・7.4 で置き換える）

## 3. 取り込みAPIの読み取りとトークンの画面

- [x] 3.1 `app/api/memos/route.ts` に `GET` を足す。あわせて `app/api/memos/[id]/route.ts` と `app/api/tags/route.ts` を作る。一覧のContainerと同じ3つの取得を使い、持ち主で絞る。応答から `userId` を外す (design D4)
- [x] 3.2 `listMemos` に任意の件数上限を足す。既存の呼び出しを変えない (design D4)。検証: `memos.test.ts` に上限の2件を追加
- [x] 3.3 `features/import/actions.ts` に発行と失効の Server Action を置き、メモ画面の上部に入口を足して、共通の `Sheet` で発行と失効を示す。平文は発行時に一度だけ示す (design D10、spec「発行と失効」)。検証: ローカルの Workers で発行・失効・平文の表示を実機確認（下の 6.2 と同じ往復）。（レビューを受けて 7.6 で置き換える）
- [x] 3.4 3.1から3.3のテストを書く。他人のメモの区別不能、タグの持ち主絞りを含む。検証: `import-read.test.ts` 9件、`import-auth.test.ts` 5件、`import-tokens.test.ts` 18件。**画面（3.3）の自動テストは無い**——DOM のテスト環境をこのリポジトリは持たず、`Sheet` の作法は `sheet.arch.test.ts` が見る

## 4. 検査と文書の更新

- [x] 4.1 `tests/architecture/auth.arch.test.ts` の「Route Handler は残っていない」を、「`app/api` の各経路が自分でトークンを確かめている」に置き換える (design D3)。検証: `tags/route.ts` の呼び出しを別名に差し替えて赤くなることを確認 (L06)
- [x] 4.2 `docs/nextjs-rework-plan.md` の「`app/api` は無い」の記述 (76行目と138行目) を更新する (design D3)。あわせて `docs/deploy.md` にマイグレーションの適用を足す
- [x] 4.3 `npm run check` を通す。`check:types` と `check:test` が CLI を含むことを確かめる (design D7)。検証: `npm run check` が緑。`check:bundle` は 207.4 KB（予算 216.5 KB）

## 5. CLI

- [x] 5.1 `cli/` に独自の `package.json` と `tsconfig.json` を置く。`check:types` の対象に加える (design D7)。検証: `npm --prefix cli run typecheck` が通る
- [x] 5.2 `login` と `logout` を作る。トークンを `~/.config/remoru/` に置く (design D7)。検証: `store.test.ts` 6件（0600 で置くことを含む）。（レビューを受けて 7.7 で置き換える）
- [x] 5.3 `memo add` を作る。引数での1件、`-f` での複数件 (空行区切り)、`--dry-run` での候補表示 (design D8)。検証: `node cli/remoru.ts memo add -f /tmp/notes.md --dry-run` が3件を表示
- [x] 5.4 `memo list`、`memo show`、`tag list` を作る。`--tag` と `--limit` と `--json` を含む (design D8)
- [x] 5.5 5.2から5.4のテストを書く。引数の分割、検証落ちの表示、終了コードを含む。検証: `cli/args.test.ts` 20件、`cli/api.test.ts` 12件、`cli/output.test.ts` 14件

## 6. SKILLと締め

- [x] 6.1 `.claude/skills/remoru/SKILL.md` を書く。起動条件、分け方の規則、`--dry-run` から確認を経て確定する順序 (design D9)。（レビューを受けて 7.8 で置き換える）
- [x] 6.2 実際の調査結果を使い、要約から登録と一覧の確認までの往復を通す (design D1・D8)。検証: `npm run preview`（Workers ランタイム）とローカルの D1 に対して `memo add` `memo list` `memo show` `tag list` を通した。401（トークン無し・不正・失効後）、21件の400、存在しない id の404 も実測

## 7. レビューを受けた修正

2026-09-27 のレビューで、設計の前提に3つの問題が見つかった。SKILL がリポジトリの外で読まれないこと、速度の制限が費用の歯止めになっていないこと、トークンの画面がメモ一覧の初期表示を重くしていることである。あわせて、一括登録の順序の崩れと、失効済みトークンの残留と、`login` が確かめずに保存することを直す。design の D2・D5・D6・D7・D9・D10 を参照する。

- [x] 7.1 スキーマを直す (design D2・D6)。`import_tokens` の `user_id` を一意にし、`name` と `revoked_at` を外す。`import_rate_limits` を消し、`import_daily_usage`（利用者、UTC の日付、件数）を足す。0009 は本番に出ていないので、新しいマイグレーションを足さずに作り直す。検証: 空のローカル D1 に全マイグレーションが通る
- [x] 7.2 `import-tokens.ts` を1人1個に直す (design D2)。発行は古い行を消してから作る（再発行）。失効は行を消す。画面向けには、有無と発行日だけを返す。検証: 再発行のあと古いトークンが null になること、失効のあと null になること、他の利用者のトークンに影響しないことをテストで確認
- [x] 7.3 `features/import/import-daily-usage.ts` に1日の件数の確保を置く。上限を超えるなら確保しない1文の upsert にする (design D6)。`import-rate-limit.ts` とそのテストは消す。検証: 100件ちょうどまで通ること、90件のあとの20件が拒まれ残り10件を返すこと、UTC の 23:59:59.999 と翌日の 00:00:00.000 で別の日として数えることをテストで確認。日の境目は、利用者の地域と無関係に UTC で決まることを、Asia/Tokyo 以外の時刻表現でも確かめる (L07)
- [x] 7.4 `POST /api/memos` で、本文の解釈のあと、保存の前に 7.3 を呼ぶ。拒んだときは429、`retry-after` に翌日までの秒数、本文にその日の残り件数を入れる。`GET` の3つは数えない (design D6)。検証: 上限に達したあと、登録は429で1件も増えず、一覧は200で返ることをテストで確認
- [x] 7.5 `importMemos` の保存時刻を「受け付けた時刻 + 配列の中の位置」にする (design D5)。検証: A、B、C を登録して一覧が C、B、A になることをテストで確認（レビューで崩れを再現した条件と同じく10件でも確かめる）
- [x] 7.6 トークンの画面を `app/(app)/settings/api/page.tsx` に移す (design D10)。読み取りは `features/import/queries.ts` を通す。発行・再発行・失効を置き、再発行と失効には確認を1回挟む。`memo-tab.tsx` の `UserButton` に `UserButton.Link`（「API トークン」）を足す。メモ画面の「AIとつなぐ」のボタン、`MemoListContainer` のトークンの取得、`importTokens` の props、`ImportTokenSheet`、それに関わる CSS を消す。検証: `app/(app)/_containers/memo-list/` から `features/import` を import していないことを確かめる。画面の操作は実機で確認する（L05・L10。ブラウザ枠で実クリックができないなら、確認できていないことを明記して利用者に頼む）
- [x] 7.7 CLI を直す (design D7・D8)。`login` は保存の前に `GET /api/tags` で確かめ、401 や通信の失敗では保存せず終了コード1にする。`memo add` は429（1日の上限）のとき、送れた件と送れなかった件、残りの件数、再開できる時刻を示す。検証: 401・通信失敗・429 の扱いを `cli/api.test.ts` と `cli/output.test.ts` で確認
- [x] 7.8 SKILL を移す (design D9)。元の文書を `cli/skill/SKILL.md` に置き、CLI の呼び出しを置き換え用の文字列で書く。「リポジトリのルートで実行する」を消す。`remoru skill install [--dir <置き場>]` を足す。`allowed-tools` は絶対パスの CLI の呼び出しだけにする。リポジトリの `.claude/skills/remoru/` を消す。検証: 一時ディレクトリへ install し、置き換え用の文字列が残っていないこと、絶対パスが入っていることをテストで確認。Remoru と無関係なディレクトリから、SKILL に書かれたとおりのコマンドで `memo list` が動くことを確かめる
- [ ] 7.9 実際の API キーで、20件の一括登録のあと全件に問答が作られるかを測る (design Risks)。ローカルの Workers（`npm run preview`）か staging で行い、作られた件数を tasks に書く。失敗が出るなら、生成を順に起こすか1回の件数を減らす形に design を直してから実装する
  - **保留（2026-09-27、利用者の判断）。** 実測はしていない。利用者から「登録する側の AI が問答まで作って送れば、Remoru 側の生成（Haiku）は要らないのでは」という案が出た。API が問答を受け取る形になり、spec と design を変える話なので、この change では扱わず、別の change として検討する。
  - 観察した事実（7.11 の走査中）: ローカルの開発サーバー（`npm run dev`、`.env.local` のキーは `GET /v1/models` が200を返す有効なもの）で取り込んだ5件は、どれも生成中の印が外れたまま `quiz_items` が0件だった。生成は起きて失敗している。サーバーのログは別のセッションが起動したもので読めず、原因は確かめていない。上の案を検討するときの材料にする
- [x] 7.10 `docs/nextjs-rework-plan.md` の申し送りを直す。メモ画面に触れるのは `memo-tab.tsx` の `UserButton` の1か所だけになり、一覧の初期表示で読むものは増えないことを書く。`docs/deploy.md` のAPIの認証の行を、1人1個のトークンと1日の上限に合わせる
- [x] 7.11 `npm run check` を通す。そのあと spec の Scenario を1つずつ、実際の API と CLI で辿る (L05)。検証: 辿った Scenario と結果を tasks に書く
  - 2026-09-27。`npm run check` は終了コード0。走査はローカルの開発サーバー（localhost:3000、ローカル D1）に、画面で発行したトークンで行った。CLI は git の外の一時ディレクトリから、`skill install` で置いた SKILL に書かれたコマンドをそのまま実行した。1日の上限の2つは、90件を実際に登録する代わりに `import_daily_usage` の行を直接書き換えて作った。他人の分は、既にある別の利用者のメモ6件と、検証のために入れた別の利用者のトークンとタグの行で確かめた（走査のあと消した）
  - トークンを発行する: 画面の「発行」で平文が1回だけ出る。別の画面から戻ると「発行日」だけになる → 期待どおり
  - トークンを再発行する: 確認（「本当に再発行しますか…」）を経て新しい平文が出る。古いトークンで `GET /api/tags` は401 → 期待どおり
  - トークンを失効する: 確認を経て「まだありません」になる。失効したトークンで `POST /api/memos` と `GET /api/memos` は401で、メモは増えない → 期待どおり
  - 他人のトークンは見えない: 別の利用者にトークンの行がある状態で、画面は自分の有無（発行日）だけを示す → 期待どおり
  - 複数件を登録する / 一覧が配列の順を保つ: A・B・C の3件を `memo add -f` で登録して3件とも成功。`memo list` と画面の一覧はどちらも C・B・A の順 → 期待どおり
  - 検証に落ちた件だけが失敗する: 正しい1件と1001字の1件を送り、1件が保存され、もう1件は「本文が長すぎます」。終了コード1 → 期待どおり。なお1日の件数は落ちた件も数える（送った件数で数える。D6 のとおり）
  - トークンが無い要求は全体を拒む: トークン無しの `POST /api/memos` は401 `unauthorized` → 期待どおり
  - 他人のメモには触れない: 一覧は自分の件だけ（別の利用者の6件は出ない）。生成の入力は、生成が失敗していた（7.9 の観察）ため確かめられていない
  - 20件を超える要求を拒む: 21件の配列に400 `too_many`、1件も増えない → 期待どおり
  - 1日の上限を超える要求を拒む: 90件の状態で20件を送ると429、`retry-after: 57758`、本文 `{"error":"rate_limited","remaining":10}`、1件も増えない。CLI は「0件を登録しました。20件は送れませんでした」「あと 10 件」「再開できるのは 9月28日 09:00 ごろ」（日本時間。UTC 0時）を示し終了コード1 → 期待どおり
  - 翌日には受け付ける: 上限に達した行を前日に移すと、登録が通り当日の行が1件で作られる → 期待どおり
  - 読み取りは件数に数えない: 100件の状態で `memo list` `tag list` `memo show` がすべて終了コード0 → 期待どおり
  - 一覧を新しい順に読む / 詳細を読む: `memo list` は新しい順で復習の状態（「問と答が未作成」）を含む。`memo show` は本文・タグ・問答の有無を返す。問答と次回出題日がある場合の表示は、生成が失敗していたため確かめていない
  - 他人のメモの詳細は無いものとして応答する: 別の利用者のメモの id と、存在しない id のどちらも404 `{"error":"not_found"}` で区別がつかない → 期待どおり
  - タグの一覧を読む: 両方の利用者にタグを1つずつ入れると、`tag list` は自分のタグだけを示す → 期待どおり
  - 別のプロジェクトで作業中のAIが登録する: SKILL を置き、git の外のディレクトリから SKILL のとおりのコマンドで `login` `memo add -f` `memo list` が動くことまで確かめた。**AI が SKILL を読み、候補を示し、確認を得てから登録する流れそのものは確かめていない**（`~/.claude/skills/` へ置いて別のセッションで試す必要がある。利用者に委ねる）
  - 使えないトークンは保存しない: 失効したトークン・でたらめなトークンは「トークンが違うか、失効しています」、つながらないあて先は「つながらなかった」で、どれも終了コード1。保存済みのファイルは変わらない → 期待どおり
- [x] 7.12 `npm run harness:review` で受領書を作ってからコミットする。前回のコミット（`f54378e`）は受領書なしでコミットされ、コミット前のゲートを通っていない。何の環境で、なぜゲートが動かなかったかを `.learnings` に記録する (L12)
  - 2026-09-27。経緯は `.learnings/active.md` の L12 に追記した（OpenCode のセッションからのコミットで、門は Claude Code の hook にしか無いため効かなかった）。この回の差分は、stage してから `HARNESS_REVIEW_RUNNER=opencode npm run harness:review` で受領書を作り、門を通してコミットする
  - あわせて、何も stage せずにレビューすると未追跡の新規ファイルが受領書から漏れる件は、規則ではなく検査にすると判断し、根拠を `docs/open-issues.md` の 5 に残した。ハーネスの変更なので、この change では入れない
