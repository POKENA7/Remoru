# Remoru

日常のちょっとしたことをメモし、エビングハウスの忘却曲線に基づいて定期的に
クイズ形式で復習させることで、記憶定着を助けるアプリ。

背景・対象ユーザー・成功指標・未確定事項は [docs/intent-statement.md](docs/intent-statement.md)。

## 開発手法: OpenSpec

仕様駆動で進める。コードを書く前に change を立て、承認してから実装する。

| コマンド | 用途 |
|---|---|
| `/opsx:explore` | 何を作るか固まっていないときの探索 |
| `/opsx:propose` | change を新規作成（proposal / spec / design / tasks を生成） |
| `/opsx:apply` | 承認済み change の実装 |
| `/opsx:update` | 既存 change の修正 |
| `/opsx:archive` | 完了した change を specs に反映してアーカイブ |
| `/opsx:sync` | specs と実装の同期 |

- `openspec/specs/` — 確定した仕様（現在のシステムの姿）
- `openspec/changes/` — 進行中の変更提案
- `openspec/config.yaml` — スキーマと言語設定、プロジェクト文脈

成果物は日本語で書く。ただし OpenSpec の構造見出しと SHALL/MUST は英語のまま。

## ハーネス: 検査は自動で走る

検査を走らせるかどうかは裁量に委ねていない。`.claude/settings.json` の hooks が
3 段で自動的に走る。検査の定義は `package.json` の `check:*` 1 か所だけにある。

| 契機 | 走るもの | 落ちたとき |
|---|---|---|
| `.ts` / `.tsx` を Edit / Write した直後 | そのファイルの整形 | 黙って直る。報告されない |
| ターンの終わり（差分があるとき） | `check:types` `check:test` | 終了できない。直すまで続く |
| `git commit` を実行しようとしたとき | `check` 全部 + レビューの受領書 | コミットできない |

手で走らせるときは `npm run check`。

**コミットの前にレビューが要る。** 門は `.harness/reviews/<差分のハッシュ>.json` が
あって `findings` が空のときだけ通す。受領書を作れるのは `npm run harness:review` だけで、
レビュー後に差分を変えると受領書は無効になる。

**コミットは 2 回に分けて呼ぶ。** 門は tool の**実行前**に判定するので、
`git add -A && git commit ...` を 1 コマンドで書くと、判定の時点でまだ add されておらず
「部分ステージ」として必ず落ちる。add とコミットは別々の呼び出しにする。

**`git commit` という語を含むコマンドは、コミットでなくても門が発火する。** 判定が
部分文字列だからで、素通りするより良い側に倒してある（design.md D5）。

**同じ検査が同じ change で 3 回落ちると、棚卸を求められて終了できなくなる。**
規則にするか、検査を足すか、見送るかを選んで
`npm run harness:promote -- --check <id> --decision rule|check|skip --note "理由"`
を実行すると外れる。見送りも記録として残る。ブロックは 1 候補につき 1 回だけ。

検査の失敗は `.learnings/failures.jsonl` に機械が追記する。手で書かない。

**`disableAllHooks` を使ったら `.learnings/active.md` に記録すること。**
それが使われた時点で、この設計は失敗したということである。何が耐えられなかったのかを
残さないと、次も同じものを作る。

## 前提

- **これは作り直し。** 先行実装が `remoru-implementation` ブランチにあるが、
  設計・スキーマ・コードは引き継がない。参照は可、流用は不可。
- **このリポジトリは public。** 秘密情報をコミットしない。実際の値は
  ホスティング先のシークレットストアに置き、`*.example` にはプレースホルダのみ。
- トランクは `main`。作業は短命なフィーチャーブランチから squash merge。

## 未解決の問題

直すと決めたが、まだ直していないものは [docs/open-issues.md](docs/open-issues.md)。
**同じ調査を繰り返さないため**に、根拠と検証済みの事実を残してある。

## 決まっていないこと

技術スタックは未決定。以下も `docs/intent-statement.md` の
「Assumptions & Open Questions」の通り未確定なので、勝手に決めずに確認すること。

- 復習スケジューリングのアルゴリズム（固定間隔か SM-2 系か）
- 問／答のペアの作り方（手動か自動生成か）
- 成功指標の合格閾値
- 復習の再提示経路（通知か、アプリを開いたときか）

@.learnings/active.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
