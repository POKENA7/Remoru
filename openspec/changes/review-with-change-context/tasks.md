## 1. 作業中の change の宣言

- [ ] 1.1 `scripts/harness/focus.sh` と `npm run harness:focus` を作る（design D1）。存在しない名前を拒む
- [ ] 1.2 `scripts/harness/focus.test.ts` を書く。拒否 / 書き読み の 2 件
- [ ] 1.3 `record-failure.sh` と `promote-gate.mjs` が `.harness/focus` を先に読むようにする。
      既存の `record-failure.test.ts` `promote-gate.test.ts` が緑のまま。focus がある場合のケースを 1 件ずつ足す

## 2. レビューの文脈

- [ ] 2.1 `review.sh` が change を決める（design D1・D3）。決められないとき非ゼロで受領書を作らない。
      `precommit-gate.test.ts` に注入ケースを足す（L06）
- [ ] 2.2 `review.sh` に `tasks.md` と `specs/**/spec.md` を同梱し、プロンプトに 2 行足す（design D2）。
      `--dry-run` でプロンプトを出し、テストで同梱を確かめる
- [ ] 2.3 `reviews.md` への追記（design D4）。findings の有無どちらでも追記されることをテストで見る

## 3. 規則

- [ ] 3.1 `CLAUDE.md` のハーネスの節に「作業を始めるとき `npm run harness:focus -- <change>`」の 1 行と、
      「計画・実装・評価は別のセッションで行う。計画の成果は `docs/` か change の中に置く」の 3 行を足す
- [ ] 3.2 `docs/Harness Engineering Checklist.md` の Level 3「Planner の成果が構造化された Artifact として保存される」を
      証拠つきで ✅ にする（`docs/nextjs-rework-plan.md` と 9 件の change）

## 4. 締め

- [ ] 4.1 `npm run harness:focus -- review-with-change-context` を打ってから `npm run harness:review` を走らせ、
      `reviews.md` に所見が残ることを見る。受領書を作り、コミットの門を通す
