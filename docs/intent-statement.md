# Intent Statement — 日常メモ × 忘却曲線クイズ復習アプリ

**Stage**: intent-capture (1.1, IDEATION)
**Date**: 2026-07-29

## Sources

- [desc] Initial description: "日常のちょっとしたことをメモし、エビングハウスの忘却曲線に基づいて定期的にクイズ形式で復習させることで、人間の記憶定着を助けるアプリを作りたい"
- [scope] Workflow-selected scope: `greenfield-product-ship`.
- [Q1]-[Q10] `intent-capture-questions.md` の確定回答

---

## Problem Statement

人は日常の中で「覚えておきたいが、覚えておく仕組みを立ち上げるほどではない」小さな事実に繰り返し出会う。近所の店の定休日、あの店のハンバーグが美味しかったこと、偶然見つけた新しい知識——こうした断片は、大事な予定（カレンダーが担う）でも本格的な学習（専用の学習アプリが担う）でもない中間帯にあり、既存ツールはこの帯に対して重すぎる。 [Q1]

本イニシアチブは、投入された断片をエビングハウスの忘却曲線に基づく間隔でクイズとして再提示することで、この中間帯の記憶定着を支える。 [desc] あわせて、メモ投入のしやすさを成功指標に据える。 [Q3]

**この製品が担わないもの（回答から明示的に確認された境界）**: 大事な予定の管理はカレンダーに、本格的な学習は専用の学習アプリに委ねる。 [Q1]

## Target Customer

- 主たる利用者は不特定多数の一般ユーザーである。 [Q2]
- ただし最初にリリースする版では、技術的にマルチユーザー対応で設計しつつ、実際の利用は招待制・限定公開に留める。公開サインアップを開けるのはその後である。 [Q9]
- 利用者が抱える痛みは、覚えておきたい些末な事実に対して既存ツールが重すぎることである。 [Q1]

## Success Metrics

| 指標 | 運用定義 | Source |
|------|----------|--------|
| 記憶定着率 | 同一メモを再出題したときの正答率が、出題回数を重ねるごとに上がること。復習なしとの対照比較は行わない。 | [Q3] [Q10] |
| メモ投入のしやすさ | 1メモあたりの入力にかかる時間・手数。 | [Q3] |

閾値（何回目で何％、何秒以内に投入できれば合格か）はこの段階では確定していない。 [assumption] — `## Assumptions & Open Questions` を参照。

## Initiative Trigger

いま作る理由は個人的な必要性である。作者自身が実際に困っており、使いたいものがない。 [Q4]

技術的な学習・検証や、外部への公開・配布計画がトリガーであるとは確認されていない。 [Q4]

## Initial Scope Signal

- **Workflow-selected scope**: `greenfield-product-ship`。 [scope]
- **User-confirmed product boundary**: 32ステージ中19ステージを実行し運用フェーズは環境構築とデプロイ実行のみという内容、および observability-setup / incident-response / performance-validation が SKIP である点を明示した上で、このスコープは利用者が想定する製品境界と一致していると確認された。 [Q8]

## Assumptions & Open Questions

- [assumption] 復習スケジューリングのアルゴリズムは未確定である。初期記述はエビングハウスの忘却曲線に言及しているが、具体的な間隔算出方式（固定間隔か、SM-2 系の適応間隔か、その他か）は本ステージの回答では決まっていない。scope-definition (1.4) で確定させる必要がある。 [desc]
- [assumption] 自由記述のメモから問／答のペアをどう作るか（利用者が手動で作るのか、自動生成するのか）は未確定である。
- [assumption] 成功指標の合格閾値（記憶定着率が何回目で何％、メモ投入が何秒以内か）は未確定である。 [Q3] [Q10]
- [assumption] 限定公開から公開サインアップへ移行する時期・条件は未確定である。 [Q9]
- [assumption] このリポジトリの `remoru-implementation` ブランチに存在する先行実装と本イニシアチブの関係（参照するのか、無関係に作り直すのか、データを引き継ぐのか）は本ステージでは確認されていない。Q4 の回答は個人的な必要性であり、先行実装の作り直しではない。 [Q4]
- [assumption] 復習の再提示をどの経路で届けるか（通知か、アプリを開いたときか、その他か）は未確定である。 [desc]

## Review

**Verdict: READY**

Re-read both artifacts fresh (not trusting the coordinator's summary) against
the Step 5 grounding contract in
`.claude/aidlc-common/stages/ideation/intent-capture.md` and cross-checked
every changed line against `intent-capture-questions.md`. All three prior
findings are genuinely resolved, not just relabeled:

1. **`[scope]` over-citation — resolved.** `[scope]` now carries only
   "Workflow-selected scope: `greenfield-product-ship`。", matching the
   register entry exactly. The stage-count content moved to the
   User-confirmed product boundary bullet under `[Q8]`, and I verified both
   halves of that sentence against the actual Q8 record: "32ステージ中19ステージ
   を実行し運用フェーズは環境構築とデプロイ実行のみ" traces to Q8's question
   preamble ("19/32ステージ、運用フェーズは環境構築とデプロイ実行のみ"), and
   "observability-setup / incident-response / performance-validation が
   SKIP である点を明示した上で" traces to Q8's confirmed-answer metadata
   (the note shown to the user before they chose `A`). "承認ゲート16" and
   "2ステージがユニット単位で反復する" are gone and do not resurface
   anywhere else in the document.

2. **`[Q1]` cited for unselected options A/B — resolved.** The two-part
   forgetting-mechanism sentence is deleted. The remaining Problem Statement
   sentence under `[desc]` ("エビングハウスの忘却曲線に基づく間隔でクイズ
   として再提示することで...記憶定着を支える") stays within what `[desc]`
   actually says. The Target Customer pain bullet now reads "覚えておきたい
   些末な事実に対して既存ツールが重すぎることである" — this tracks Q1's
   actual confirmed `X. Other` text ("ちょっとしたことを覚えておきたいが、
   既存ツールは重い") rather than the deleted A/B framing. The Initiative
   Trigger sentence ("作者自身が実際に困っており、使いたいものがない") is now
   close to verbatim on Q4's confirmed answer.

3. **Inference presented as fact — resolved.** The closing Initial Scope
   Signal sentence is cut, not relocated. I checked whether cutting (vs.
   moving to `## Assumptions & Open Questions`) created any gap: it did not
   — the stage's required "Initial Scope Signal" content (show
   workflow-selected scope separately from user-confirmed boundary) is fully
   satisfied by the two remaining bullets, and the six-item assumption list
   still matches the human's `A. Accept assumptions` confirmation in
   `intent-capture-questions.md` exactly (I re-diffed both lists item by
   item; no drift).

**Hunted for new/left-behind issues, found none blocking:**
- Re-verified every remaining inline tag in `intent-statement.md`
  (`[Q1]`–`[Q10]`, `[desc]`, `[scope]`) resolves to content actually present
  in `intent-capture-questions.md` and is no broader than what that content
  states.
- The `Assumptions & Open Questions` bullet mentioning the
  `remoru-implementation` branch relationship carries no independent
  permitted-source tag for the branch-existence premise itself — but this is
  correctly the case Step 5 rule 5 exists for (content that cannot be
  confirmed from a permitted source, retained only under this heading,
  tagged `[assumption]`), so it is not a defect.
- `stakeholder-map.md` is confirmed unchanged and remains clean on a fresh
  read: every stakeholder/communication row still carries a `Source` column,
  unresolved fields still use `Unknown (open question) [assumption]`
  correctly, and its own three-item assumption list still matches the
  human's confirmation exactly.
- Both artifacts still carry `## Assumptions & Open Questions` (required
  section present in both), and `required-sections`/`upstream-coverage`
  sensor preconditions remain satisfied (≥2 H2 headings; no `consumes:`
  entries to reference).

One non-blocking style note: the Problem Statement's second paragraph now
carries a `[Q3]` sentence ("あわせて、メモ投入のしやすさを成功指標に据える")
that duplicates content already tabulated under Success Metrics. It is
correctly sourced, just placed under a heading that isn't its primary home —
a polish item for the builder to consider, not a grounding defect and not
grounds for NOT-READY.

Engineering can proceed from these artifacts without a follow-up question.
