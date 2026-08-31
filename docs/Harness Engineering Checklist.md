# Harness Engineering Repository Checklist

## 判定ルール

- 各項目をリポジトリ内のファイル・設定・CI・テスト・スクリプト等の**証拠**に基づいて判定する。
- 証拠が確認できない場合は `❌` とする。
- 推測で `✅` にしない。
- 各項目について `判定 / 証拠 / 不足点` を記録する。
- 「人間が知っている」「口頭で運用している」は証拠として認めない。
- 原則として、ルールが文書化されているだけでは機械的強制とはみなさない。
- `部分的に満たす` は作らず、`✅` または `❌` で判定する。

---

# Level 0 — AI-assisted development

以下のみでは Harness Engineering と判定しない。

- [x] AI coding agent を利用している
- [x] `AGENTS.md` / `CLAUDE.md` 等が存在する
- [x] Skills / Instructions が存在する
- [x] AI Code Review を利用している

---

# Level 1 — Harness Ready

## Context / Knowledge

- [x] ルートに Agent Entry Point が存在する。
- [ ] Agent Entry Point がプロジェクト概要・技術スタック・基本的な開発手順を示している。
- [ ] Agent Entry Point から主要な設計・開発・テスト・リリース資料へ辿れる。
- [x] Agent Entry Point が巨大な百科事典になっておらず、詳細情報が別ファイルへ分離されている。
- [x] Agent が必要な主要知識を Repository 内から辿れる。
- [x] 重要な設計判断が人間の記憶やチャット履歴だけに依存していない。
- [ ] ドキュメントの重複・矛盾を検出する仕組みがある。
- [ ] ドキュメントの Owner が明確である。
- [x] ドキュメントの更新・レビュー方法が定義されている。

## Guides / Constraints

- [ ] 命名規則が明文化されている。
- [ ] ディレクトリ構成ルールが明文化されている。
- [x] コードフォーマットが自動化されている。
- [x] Lint ルールが自動化されている。
- [x] 禁止パターンが明文化されている。
- [x] 推奨パターンが明文化されている。
- [ ] アーキテクチャのレイヤーが定義されている。
- [ ] モジュールの責務が定義されている。
- [x] 依存方向が定義されている。
- [ ] 公開 API と内部 API の境界が定義されている。

## Deterministic Verification

- [x] Formatter が自動実行できる。
- [x] Linter が自動実行できる。
- [x] 型チェックが自動実行できる。
- [x] Unit Test が自動実行できる。
- [x] Integration Test が自動実行できる。
- [ ] E2E Test が存在する。
- [ ] Build が自動検証できる。
- [ ] Dependency / Security Check が自動実行できる。
- [x] Architecture / Structural Check が自動実行できる。
- [x] CI で主要な検証が自動実行される。

## Agent Feedback

- [x] Test 失敗結果を Agent が取得できる。
- [x] Lint 失敗結果を Agent が取得できる。
- [x] Build 失敗結果を Agent が取得できる。
- [x] Architecture 違反結果を Agent が取得できる。
- [x] 検証結果にエラー箇所が含まれる。
- [x] 検証結果に修正方法または参照先を含められる。
- [x] Agent が失敗 → 修正 → 再検証を実行できる。

## Environment / Lifecycle

- [ ] 新しい Agent Session 用の環境を自動初期化できる。
- [x] 依存関係を自動セットアップできる。
- [x] Build 方法を CLI から実行できる。
- [x] Test 方法を CLI から実行できる。
- [ ] Smoke Test を実行できる。
- [x] Session 開始時に現在の Build / Test 状態を確認できる。
- [x] 前回 Session の未解決問題を確認できる。
- [x] Session 終了時に進捗を保存できる。
- [x] 次の Session が前回の進捗を確認できる。
- [x] Agent が作業対象を限定して実行できる。

---

# Level 2 — Harness Engineering

## Architecture Enforcement

- [ ] 重要なアーキテクチャルールが機械的に検証される。
- [ ] 禁止されている依存関係が CI で FAIL する。
- [ ] 循環依存が自動検出される。
- [ ] Public API の境界違反が自動検出される。
- [ ] 重要な設計原則に対する Structural Test が存在する。
- [ ] Architecture 違反のエラーメッセージに修正方法または参照先が含まれる。

## Golden Principles / Invariants

- [ ] プロジェクトで絶対に守る設計原則が定義されている。
- [ ] 各設計原則に機械的な検証方法がある。
- [ ] 設計原則違反が CI で FAIL する。
- [ ] 設計原則違反時に Agent が修正方法を取得できる。
- [ ] 実装方法ではなく守るべき Invariant を中心にルールが定義されている。

## Task / Feature Control

- [ ] Agent Task ごとに明確な目的が定義されている。
- [ ] Task ごとに変更対象範囲が定義されている。
- [ ] Task ごとに変更禁止範囲が定義されている。
- [ ] 複雑な Feature を小さな Task に分割できる。
- [ ] Feature ごとに機械的に確認可能な完了条件がある。
- [ ] Feature の完了状態を構造化データで管理できる。
- [ ] Agent が完了済み Feature を勝手に削除・改変できない。

## E2E / Real-world Verification

- [ ] Unit Test だけで Feature 完了を判定していない。
- [ ] ユーザー視点の E2E Test が存在する。
- [ ] 実際のアプリケーション実行環境で検証できる。
- [ ] UI が関係する場合、実際の UI 操作を検証できる。
- [ ] API が関係する場合、実際の API 呼び出しを検証できる。
- [ ] SDK が関係する場合、Consumer / Sample App から検証できる。
- [ ] E2E 失敗結果を Agent が取得できる。

## Session Handoff

- [ ] Session 終了時に進捗が保存される。
- [ ] 完了済み作業が記録される。
- [ ] 未完了作業が記録される。
- [ ] 既知の問題が記録される。
- [ ] 次に実施すべき作業が記録される。
- [ ] 重要な設計判断が記録される。
- [ ] Git History から前回の変更を追跡できる。
- [ ] Session 開始時に進捗・Git History・Feature State を確認できる。

## Independent Evaluation

- [ ] Agent の成果を独立した Evaluator が評価できる。
- [ ] Evaluator に明確な評価基準がある。
- [ ] Evaluator が PASS / FAIL を明示する。
- [ ] Evaluator が FAIL 理由を具体的に出す。
- [ ] Evaluator の結果を Generator / Implementer に返せる。
- [ ] FAIL → 修正 → 再評価のループが実行できる。

## Evals

- [ ] 代表的な Agent Task の Capability Eval が存在する。
- [ ] 各 Eval に成功条件が定義されている。
- [ ] 過去に成功した Task の Regression Eval が存在する。
- [ ] Agent / Model / Harness 変更後に Regression Eval を実行できる。
- [ ] Eval 結果を成功率等の指標で比較できる。

## Observability

- [ ] Agent の Tool Call を記録できる。
- [ ] Tool Call Error を記録できる。
- [ ] Test Failure を記録できる。
- [ ] Agent Session を追跡できる。
- [ ] Token / Runtime Cost を計測できる。
- [ ] Agent Task の成功・失敗を追跡できる。
- [ ] Agent の失敗と Harness の失敗を区別できる。

## Security / Permissions

- [ ] Agent が実行できるコマンドが制御されている。
- [ ] 危険なコマンドの実行が制限されている。
- [ ] Secrets へのアクセスが制限されている。
- [ ] Production 環境へのアクセスが制限されている。
- [ ] Production DB への破壊的操作権限を Agent に与えていない。
- [ ] 破壊的操作に Human Approval が必要である。
- [ ] Agent の変更可能範囲が制限されている。

## Harness Governance

- [ ] Harness の Owner が明確である。
- [ ] Agent Instructions の Owner が明確である。
- [ ] Structural Check の Owner が明確である。
- [ ] Eval の Owner が明確である。
- [ ] Harness の変更が Git 管理されている。
- [ ] Harness の変更が通常のコード変更と同様に Review される。
- [ ] Harness の定期レビューが実施される。

---

# Level 3 — Agent-First Engineering

## Agent Orchestration

- [ ] Planner と Generator / Implementer の責務が分離されている。
- [ ] Generator / Implementer と Evaluator の責務が分離されている。
- [ ] Generator が自身の成果を唯一の評価者になっていない。
- [ ] Planner の成果が構造化された Artifact として保存される。
- [ ] Evaluator の成果が構造化された Artifact として保存される。

## Autonomous Feedback Loop

- [ ] Agent が自動的に検証を実行できる。
- [ ] 検証失敗時に Agent が自動修正できる。
- [ ] 修正後に自動再検証できる。
- [ ] Retry 回数または停止条件が定義されている。
- [ ] 解決不能な場合に Human へ Escalate できる。
- [ ] 無限 Retry を防止できる。

## Environment Control

- [ ] Agent ごとに Worktree / Workspace を分離できる。
- [ ] 複数 Agent の同時実行で作業が干渉しない。
- [ ] Agent ごとに Application 実行環境を分離できる。
- [ ] Agent ごとに Logs / Metrics を分離できる。
- [ ] Agent の変更を容易に破棄できる。
- [ ] Agent が UI / Logs / Metrics / Traces を必要に応じて直接取得できる。

## Harness Evaluation

- [ ] Harness 自体の Capability Eval が存在する。
- [ ] Harness 自体の Regression Eval が存在する。
- [ ] Harness 変更前後で同一 Eval を実行できる。
- [ ] Harness 変更による Agent 成功率への影響を測定できる。
- [ ] Harness 変更による Token 使用量への影響を測定できる。
- [ ] Harness 変更による Runtime / Latency への影響を測定できる。
- [ ] Harness 変更による Human Intervention 回数への影響を測定できる。
- [ ] Harness の変更を実利用環境で評価できる。

## Agent Observability

- [ ] Tool Call の種類・成功・失敗を構造化ログとして保存する。
- [ ] Agent Session 全体を再構成できる。
- [ ] 失敗した Task の原因を追跡できる。
- [ ] 未知の Tool / Harness Error を検出できる。
- [ ] コスト異常を検出できる。
- [ ] Agent の実行結果を後から監査できる。

## Garbage Collection / Entropy Control

- [ ] Repository 全体を定期的にスキャンできる。
- [ ] Architecture 違反を定期検出できる。
- [ ] Dead Code を定期検出できる。
- [ ] Duplicate Code / Pattern を定期検出できる。
- [ ] 古いドキュメントを定期検出できる。
- [ ] Deprecated Pattern の残存を定期検出できる。
- [ ] 検出結果から修正 Task / PR を生成できる。
- [ ] Cleanup によって既存機能が壊れていないことを自動検証できる。

## Continuous Harness Improvement

- [ ] Agent の失敗事例を収集できる。
- [ ] Agent の失敗原因を分類できる。
- [ ] 同一失敗の再発を検出できる。
- [ ] Agent Failure から Harness 改善項目を作成できる。
- [ ] Harness 改善後に Regression Eval を実行できる。
- [ ] Harness 改善の効果を定量評価できる。
- [ ] Harness 自体が継続的に改善されるプロセスがある。

---

# Level 判定

## Level 1 — Harness Ready

以下をすべて満たす。

- [ ] Level 1 の全項目が `✅`
- [x] Agent が Repository 内の必要な知識を自力で辿れる。
- [ ] 主要な開発ルールが明文化されている。
- [x] 主要な検証を機械的に実行できる。
- [x] 検証結果を Agent に返せる。
- [x] Session を跨いで進捗を引き継げる。

## Level 2 — Harness Engineering

以下をすべて満たす。

- [ ] Level 1 の全項目が `✅`
- [ ] Level 2 の全項目が `✅`
- [ ] 重要な Architecture / Invariant が機械的に強制される。
- [ ] E2E / Real-world Verification がある。
- [ ] 独立した Evaluator がある。
- [ ] Capability Eval と Regression Eval がある。
- [ ] Agent Observability がある。
- [ ] Security / Permission Boundary がある。
- [ ] Harness の Owner と Review Process がある。

## Level 3 — Agent-First Engineering

以下をすべて満たす。

- [ ] Level 1 の全項目が `✅`
- [ ] Level 2 の全項目が `✅`
- [ ] Level 3 の全項目が `✅`
- [ ] Planner / Generator / Evaluator が分離されている。
- [ ] Agent が検証 → 修正 → 再検証を自律的に実行できる。
- [ ] Agent 実行環境が分離されている。
- [ ] Harness 自体を Eval できる。
- [ ] Repository の Entropy / Garbage を定期的に検出できる。
- [ ] Agent Failure を Harness 改善へ継続的に反映できる。

---

# AI によるチェック結果フォーマット

各項目について以下の形式で出力する。

| ID | Level | Check | Result | Evidence | Missing |
|---|---|---|---|---|---|
| L1-C01 | 1 | Agent Entry Point が存在する | ✅/❌ | `AGENTS.md` | - |
| L1-C02 | 1 | 主要ドキュメントへ辿れる | ✅/❌ | `AGENTS.md:12` | `docs/testing.md` がない |

最後に以下を出力する。

## Summary

- Level 1: `x / y`
- Level 2: `x / y`
- Level 3: `x / y`
- Overall Level: `Level 0 / Level 1 / Level 2 / Level 3`

## Critical Gaps

Level を阻害している項目を重要度順に列挙する。

## Evidence

各 `✅` / `❌` の判定根拠となった Repository 内のファイル・設定・CI・テスト・スクリプトを列挙する。
