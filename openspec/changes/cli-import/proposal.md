## Why

コマンドを実行できるAIに調査させ、その結果をRemoruに登録したいという使い方が出てきた。覚えたい箇所の要約は調査したAI自身が行い、登録まで行う。

現在の投入口は画面の投稿欄だけであり、AIから直接登録する手段が無い。調査結果は長文になるため、そのまま貼ると本文の上限 (1000字) に当たり、1つのメモに複数の事実が入って問の質が落ちる。長文をメモに分ける規則をAIに渡す手段も無い。

## What Changes

- 取り込み専用のトークンを発行し、失効できるようにする。
- 取り込みAPIを用意する。登録 (`POST /api/memos`)、一覧 (`GET /api/memos`)、詳細 (`GET /api/memos/[id]`)、タグ一覧 (`GET /api/tags`) である。認証はBearerトークンで行う。
- CLIを用意する。`login` と `logout`、`memo add`、`memo list`、`memo show`、`tag list` を持つ。読み取り系には `--json` を付けられる。
- SKILLの文書 (`.claude/skills/remoru/SKILL.md`) を用意する。起動条件と分け方の規則と確認の順序を書き、調査するAIに読ませる。
- 新しい capability `agent-import` を追加する。
- 付随して2か所を直す。`tests/architecture/auth.arch.test.ts` が「`app/api` は無い」を固定しているので、この用途の経路を認める形に変える。`docs/nextjs-rework-plan.md` の「`app/api` は無い」の記述を更新する。

### Non-goals

- 修正系のコマンド (本文の書き直し、削除、タグ付け、問答の手書き) は第二段階に回す。当面はアプリの画面で行う。
- 復習の実行 (出題と自己採点) をCLIに入れること。復習はアプリを開いて行う体験のままにする。
- CLIの配布 (パッケージ公開など)。リポジトリからの直接実行までとする。
- 共有シート受けとブラウザ拡張。取り込みが習慣になった後の検討に残す。
- 確認なしの自動登録。`--dry-run` での候補表示と利用者の確認を経て確定する順序を変えない。

## Capabilities

- 新規: `agent-import` (`openspec/changes/cli-import/specs/agent-import/spec.md`)。

## Impact

| 対象 | 変更 |
|---|---|
| 変更 | `db/schema.ts` (取り込みトークンと速度制限の表)、`features/memo/memos.ts` (一覧に任意の件数上限)、`features/memo/components/memo-tab.tsx` (トークン画面の入口)、`tests/architecture/auth.arch.test.ts` (経路の認証の検査へ)、`docs/nextjs-rework-plan.md` (記述の更新)、`docs/deploy.md` (マイグレーションの適用とAPIの認証)、`package.json` と `tsconfig.json` (`check:types` に CLI を足す) |
| 新規 | `drizzle/` のマイグレーション、`app/api/` (3経路、4操作)、`features/import/` (トークンのドメインと検証、画面の部品)、`cli/` (コマンド群、独自の `package.json` とテスト)、`.claude/skills/remoru/SKILL.md`、`openspec/changes/cli-import/specs/agent-import/spec.md` |
| 変更しない | 画面の投稿と一覧の流れ、問答の生成 (`features/quiz/`)、復習 (`features/review/`)。取り込みAPIは既存のドメイン関数を再利用し、振る舞いを変えない |
