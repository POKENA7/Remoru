## Why

コマンドを実行できるAIに調査させ、その結果をRemoruに登録したいという使い方が出てきた。覚えたい箇所の要約は調査したAI自身が行い、登録まで行う。

現在の投入口は画面の投稿欄だけであり、AIから直接登録する手段が無い。調査結果は長文になるため、そのまま貼ると本文の上限 (1000字) に当たり、1つのメモに複数の事実が入って問の質が落ちる。長文をメモに分ける規則をAIに渡す手段も無い。

調査はRemoruと無関係なプロジェクトやディレクトリで行われる。登録の手段は、そこで動いているAIから使えなければならない。

## What Changes

- 取り込み専用のトークンを、利用者ごとに1個まで発行できるようにする。再発行と失効もできるようにする。
- 取り込みAPIを用意する。登録 (`POST /api/memos`)、一覧 (`GET /api/memos`)、詳細 (`GET /api/memos/[id]`)、タグ一覧 (`GET /api/tags`) である。認証はBearerトークンで行う。
- 登録の件数に上限を設ける。1回20件まで、利用者ごとに1日100件（UTC の日付）までとする。一括で登録したメモは、配列の順を一覧の順に保つ。
- トークンの画面を `/settings/api` に置き、アカウントのメニューから開く。メモ画面にはボタンを足さず、一覧の描画でトークンを読まない。
- CLIを用意する。`login` と `logout`、`memo add`、`memo list`、`memo show`、`tag list`、`skill install` を持つ。読み取り系には `--json` を付けられる。絶対パスで呼べば、どのディレクトリからでも使える。`login` はトークンが使えることを確かめてから保存する。
- SKILLの文書を `cli/skill/SKILL.md` に用意する。`remoru skill install` で `~/.claude/skills/remoru/` に配置し、どのプロジェクトで動くAIにも読ませる。
- 新しい capability `agent-import` を追加する。
- 付随して2か所を直す。`tests/architecture/auth.arch.test.ts` が「`app/api` は無い」を固定しているので、この用途の経路を認める形に変える。`docs/nextjs-rework-plan.md` の「`app/api` は無い」の記述を更新する。

### Non-goals

- 修正系のコマンド (本文の書き直し、削除、タグ付け、問答の手書き) は第二段階に回す。当面はアプリの画面で行う。
- 復習の実行 (出題と自己採点) をCLIに入れること。復習はアプリを開いて行う体験のままにする。
- CLIの配布 (パッケージ公開など)。リポジトリを手元に置き、絶対パスで実行するまでとする。
- 共有シート受けとブラウザ拡張。取り込みが習慣になった後の検討に残す。
- 確認なしの自動登録。`--dry-run` での候補表示と利用者の確認を経て確定する順序を変えない。
- 一括で登録した件の復習の日をずらすこと。同じ日にまとめて復習の対象になってよい。

## Capabilities

- 新規: `agent-import` (`openspec/changes/cli-import/specs/agent-import/spec.md`)。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `db/schema.ts` (取り込みトークンと1日の件数の表)、`features/memo/memos.ts` (一覧に任意の件数上限)、`features/memo/components/memo-tab.tsx` (`UserButton` のメニューに1項目)、`tests/architecture/auth.arch.test.ts` (経路の認証の検査へ)、`docs/nextjs-rework-plan.md` (記述の更新)、`docs/deploy.md` (マイグレーションの適用とAPIの認証)、`package.json` と `tsconfig.json` (`check:types` に CLI を足す) |
| 新規 | `drizzle/` のマイグレーション、`app/api/` (3経路、4操作)、`app/(app)/settings/api/` (トークンの画面)、`features/import/` (トークンのドメインと検証、件数の上限、画面の部品)、`cli/` (コマンド群、SKILL の元の文書、独自の `package.json` とテスト)、`openspec/changes/cli-import/specs/agent-import/spec.md` |
| 変更しない | 画面の投稿と一覧の流れ、メモの一覧の初期表示で読むもの、問答の生成 (`features/quiz/`)、復習 (`features/review/`)。取り込みAPIは既存のドメイン関数を再利用し、振る舞いを変えない |
