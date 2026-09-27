## 2026-09-25T18:50:00Z  hash=d390fecc4da164961c7059dc1137f0c167b1fab08c79befae303888384a2991c  findings=8

**このレビューは `npm run harness:review` ではなく、OpenCode のサブエージェントで行った。** この環境の `claude` CLI が動かない（native binary not installed）ため、受領書（`.harness/reviews/<hash>.json`）は作られていない。指摘と対応をここに残す。

所見の全体: 利用者ごとの分離の破れは無し。`agent-import` spec の Requirement / Scenario は満たされている。タスクのテスト件数の主張は実測と一致。一方で、**検査が緑のまま何も守っていない状態**が2件見つかった。

### 高（対応済み）

- `tests/architecture/auth.arch.test.ts:278` 経路の認証検査がファイル単位の文字列一致で、同じファイルの一方のハンドラから認証を消しても緑のままだった。
  → ハンドラ単位（`exportedFunctions` の本体ごと）に見る形に変えた。`app/api/memos/route.ts` の `GET` から `getImportRequestContext()` を外す注入で赤になることを確認した。
- `features/import/request-context.ts:32` 認証の入口がどのテストからも実行されず、ヘッダ名を変えても緑のままだった。
  → 要求の解釈と表の照合を `features/import/import-auth.ts` に切り出し、`import-auth.test.ts`（5件）で確かめる形にした。`server-only` を持つ `request-context.ts` の唯一の外との接点（`authorization` ヘッダ）は、構造の検査で固定した。注入で赤になることを確認した。

### 中（対応済み）

- `.claude/skills/remoru/SKILL.md:52` 「終了コードが 2 のときは使い方の誤り」が誤り。本文が空などの入力の誤りでも 2 を返す。
  → 「入力の使い方の誤りである（本文が空、値の付け忘れなど）」に直した。
- `features/import/components/import-token-sheet.tsx:84` 共通の `<Sheet>` を使わず、閉じる手段が「←」1つだけだった（`sheet` の要件、`sheet.arch.test.ts` の走査対象外）。
  → 共通の `<Sheet>` を使う形に変えた。外側・引く・ボタン・Escape・焦点の復帰を得る。あわせて design D10 を更新した。
- `openspec/changes/cli-import/tasks.md:20` 3.4 の [x] が、3.3（Server Action と画面）のテストを含むと読めるが、そのテストは無い。
  → 何を自動テストで確かめ、何を実機で確かめたかを書き分けた。DOM のテスト環境を持たないため、画面は `sheet.arch.test.ts` とローカルの実機確認に委ねることを明記した。

### 低（対応済み）

- `design.md:55` / `import-rate-limit.ts:10`「守るのは濫用による費用であり」は目的語が反転している。また「同時に届いた要求が同じ数を見ることがある」は、1文の upsert と合わない。
  → 「濫用による費用の増大」に直し、数え上げは同じ1分の中では正しく、**厳密でないのは1分の区切り**であると書き直した。
- `features/import/actions.ts:12` 参照している design の番号が別 change のものだった。
  → 番号をやめ、`features/memo/actions.ts` と同じ形であることを指すようにした。
- `cli/remoru.ts:39` HELP に `memo show --json` と `tag list --json` が無かった。`login --token` が履歴に残る点も書いていなかった。
  → 両方を足し、標準入力を先に示した。
- `cli/remoru.ts:165` `--tag` に知らない名前を渡すと、その名前を id として送って「メモはありません」になっていた。
  → 名前で見つからず UUID の形でもなければ、エラーとして止めるようにした。
- `app/(app)/_containers/memo-list/container.tsx:48` トークンの取得が失敗すると、一覧ごと空の画面に落ちていた。
  → トークンの取得だけ失敗を吸収し、シートに「いま読めませんでした」と出すようにした。
- `db/schema.ts:201` 失効しても速度制限の行が残った。
  → 失効時に消すようにした（テストつき）。
- `middleware.ts:16` / `lib/session.ts:26` の説明が、いまの `app/api` と合わなかった。
  → 取り込みAPIはトークンで確かめる、と直した。
- `cli/store.ts:47` `writeFileSync` の `mode` は新規作成のときだけ効き、緩い権限のファイルを上書きすると 0600 にならなかった。
  → 書き込みのあとに `chmodSync` で締め直すようにした（テストつき）。
- `features/import/import-api.ts:106` 「本文は記録に出さない」というコメントが、生の例外を渡している実装と合わなかった。
  → 「こちらから本文を記録に出さない。例外の中身までは保証しない」に直した。
- `cli/api.ts:101` 応答の `results` の件数が欠けていても添字で突き合わせ、取り違えて表示しうる。
  → 件数が合わない応答は失敗として扱うようにした（テストつき）。
- `app/api/memos/route.ts:67` `?tag=`（空文字）が絞り込み無しとして通っていた。
  → 400（`invalid_tag`）にした。

### 確信が持てないまま残した点

- `cli/output.ts` の `--dry-run` は、指摘を受けて**送る本文をそのまま出す**ようにした。
- `cli/api.ts` の `BATCH_SIZE` と `features/import/import-api.ts` の `MAX_IMPORT_ITEMS` は別々に書いてある（CLI は独立したパッケージのため import できない）。`tests/architecture/import-batch.arch.test.ts` で一致を固定した。
- `features/import/import-read.ts` の一覧は、`limit` を付けても復習の状態とタグを利用者のメモ全体から求める。画面の一覧と同じ形であり、いまは許容する（design の Risks に記録）。
- `tasks.md` 6.2 の往復は手作業の実測であり、リポジトリのテストからは再現できない（実施内容は tasks に記載）。

## 2026-09-27T03:18:45Z  hash=ac38f2de5e01e09f1cdcf00bea73e6aedc0e1653175e8e5ad3644785c93cba49  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=0

所見: 差分は harness の実行系切替と文書の更新に限定され、7.x は未チェックのため主張との不一致は無い。新規テストは受領書・終了コード・読み取り専用設定を直接検証し、runner 分岐は未知値で閉じる。確信できる正しさの欠陥は見つからなかった。

## 2026-09-27T04:04:59Z  hash=939254f22b8997c20a1238652e53ba6b51b9f7b3343ae7bf0c233b7880c45f28  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=0

差分は委任スクリプトとレビュー実行系の切替え、権限テスト、設計・spec・tasks文書の更新が中心である。正しさの観点で確信できる欠陥（await抜け、条件・境界値の誤り、分離破れ、資源漏れ、守っていない検査、タスクと実装の不一致）は見つからなかった。

## 2026-09-27T05:23:01Z  hash=2ea45cc21801cebf7be4d75e677e845e4d58cb9b75055d4957d7c9538edd8ad7  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=2

読取失敗と空状態の区別喪失と、失効後の平文残留の2件。いずれも単一トークン化で顕在化し、前者は有効トークンの誤削除、後者は無効な秘密鍵の提示につながる。

- app/(app)/_containers/memo-list/container.tsx:52 getImportToken() の失敗を catch で null に潰し、トークン無しと同一視している。Sheet は null を「まだありません」として発行表示に切り替えるため、読取失敗時に既存トークンの再発行を誘発し古い有効トークンを消しかねない。コメントの「読めなかった」と示す主張とも不一致。
- features/import/components/import-token-sheet.tsx:55 revoke() が issued（発行直後の平文）を消さない。1人1個のため失効は直前に発行した平文を必ず無効化するが、画面には無効な秘密鍵が有効であるかのように残り続け、複写した利用者は401になる。

## 2026-09-27T05:39:25Z  hash=d79ec5584b36c6c6c282192b0c04d9cbab2710599cef5dc04401ed4432817360  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=0

差分全体を確認した。7.1から7.5の実装とテストはタスクの検証条件どおりで、await漏れや条件の取り違え、境界値や利用者分離の破れは見当たらなかった。順序の固定と枠消費の順序も仕様どおりである。

## 2026-09-27T06:30:03Z  hash=c8a7c9dd41fe00bac5f49c9c8633609f4957dd9eaaa1140f7a653c0bad6baa65  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=0

差分全体を確認した。7.6の画面移設と取得の分離、7.7のlogin事前確認と429表示はいずれも実装とテストが対応している。429時のバッチ打ち切りや残件数・再開時刻の扱い、利用者分離の経路にも確信できる誤りは見つからなかった。

## 2026-09-27T06:34:16Z  hash=e0bdcd3dc5ede8a44ae7450b0d9914c4b5b941b1eb7bc9a1adc93184b7d11ba1  runner=opencode  model=opencode-go/muse-spark-1.3-contributor  findings=0

差分全体を確認した。認証・件数上限・429の打ち切り・保存前確認のいずれにも、await漏れ・条件の取り違え・境界値の誤り・利用者分離の破れは見当たらない。テストは429と401/通信失敗の分岐を直接検証しており、緑のまま何も守っていない状態でもない。7.6と7.7の[x]に対応する実装と検証用テストは差分内に存在する。
