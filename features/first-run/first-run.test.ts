import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { finishGuide, hasFinishedGuide } from "./first-run";
import { createTestDb } from "@/lib/test-db";

/**
 * 埋め戻しの SQL は**マイグレーションから読む**。ここに書き写すと、
 * マイグレーションを直したときにテストだけ古いまま緑になる。
 */
const BACKFILL = sql.raw(
  readFileSync("drizzle/migrations/0009_backfill_first_run_state.sql", "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim(),
);

const NOW = Date.UTC(2026, 7, 26, 3, 0, 0);

describe("初回の導きの状態", () => {
  it("何も記録がなければ、まだ終えていない", async () => {
    const db = createTestDb();
    expect(await hasFinishedGuide(db, "u1")).toBe(false);
  });

  it("終えると、以後は終えている", async () => {
    const db = createTestDb();
    await finishGuide(db, { userId: "u1", now: NOW });
    expect(await hasFinishedGuide(db, "u1")).toBe(true);
  });

  it("二度呼んでも終えた時点は動かない", async () => {
    const db = createTestDb();
    await finishGuide(db, { userId: "u1", now: NOW });
    await finishGuide(db, { userId: "u1", now: NOW + 86400000 });

    // 「いつ初めて見せたか」が後ろへずれないこと
    const { firstRunState } = await import("../../db/schema");
    const rows = await db.select().from(firstRunState);
    expect(rows).toHaveLength(1);
    expect(rows[0].guidedAt).toBe(NOW);
  });

  it("他の利用者の記録は混ざらない", async () => {
    const db = createTestDb();
    await finishGuide(db, { userId: "u2", now: NOW });

    // u2 が終えていても、u1 はまだ終えていない
    expect(await hasFinishedGuide(db, "u1")).toBe(false);
    expect(await hasFinishedGuide(db, "u2")).toBe(true);
  });
});

/**
 * 表を作る前から使っている人の扱い。
 *
 * `first_run_state` は change 11 で作った表なので、それ以前の利用者は
 * 記録が無い＝未了と判定される。埋め戻し（0009）が無いと、ずっと前に
 * 書いたメモに「初めての告知」が出る。
 */
describe("表を作る前から使っている人", () => {
  it("問答を持つ人は導き済みとして埋め戻される", async () => {
    const db = createTestDb();
    const { memos, quizItems, firstRunState } = await import("../../db/schema");

    const OLD = NOW - 30 * 86_400_000;
    await db.insert(memos).values({ id: "m1", userId: "u1", content: "古いメモ", createdAt: OLD });
    await db
      .insert(quizItems)
      .values({ id: "q1", memoId: "m1", question: "問", answer: "答", createdAt: OLD });

    // 埋め戻す前は「まだ終えていない」に見える
    expect(await hasFinishedGuide(db, "u1")).toBe(false);

    // 0009 と同じ埋め戻しを走らせる
    await db.run(BACKFILL);

    expect(await hasFinishedGuide(db, "u1")).toBe(true);
    const rows = await db.select().from(firstRunState);
    // 埋めた時刻は「いま」ではなく、問答が最初に作られた時刻
    expect(rows[0].guidedAt).toBe(OLD);
  });

  it("問答を持たない人には行そのものを作らない", async () => {
    const db = createTestDb();
    const { memos, firstRunState } = await import("../../db/schema");
    // 生成が全部失敗した人。まだ仕組みを見ていないので、導きは残す
    await db.insert(memos).values({ id: "m1", userId: "u1", content: "メモ", createdAt: NOW });

    await db.run(BACKFILL);

    expect(await hasFinishedGuide(db, "u1")).toBe(false);
    // guided_at が NULL の行を残さない。残すと「終えていないのに行がある」
    // という状態になり、あとで終えられるかどうかが書き込み側に依存する
    expect(await db.select().from(firstRunState)).toHaveLength(0);
  });

  it("guided_at が NULL の行があっても、あとから終えられる", async () => {
    const db = createTestDb();
    const { firstRunState } = await import("../../db/schema");
    await db.insert(firstRunState).values({ userId: "u1", guidedAt: null });

    await finishGuide(db, { userId: "u1", now: NOW });

    expect(await hasFinishedGuide(db, "u1")).toBe(true);
  });
});
