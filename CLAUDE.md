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

## 前提

- **これは作り直し。** 先行実装が `remoru-implementation` ブランチにあるが、
  設計・スキーマ・コードは引き継がない。参照は可、流用は不可。
- **このリポジトリは public。** 秘密情報をコミットしない。実際の値は
  ホスティング先のシークレットストアに置き、`*.example` にはプレースホルダのみ。
- トランクは `main`。作業は短命なフィーチャーブランチから squash merge。

## 決まっていないこと

技術スタックは未決定。以下も `docs/intent-statement.md` の
「Assumptions & Open Questions」の通り未確定なので、勝手に決めずに確認すること。

- 復習スケジューリングのアルゴリズム（固定間隔か SM-2 系か）
- 問／答のペアの作り方（手動か自動生成か）
- 成功指標の合格閾値
- 復習の再提示経路（通知か、アプリを開いたときか）

@.learnings/active.md
