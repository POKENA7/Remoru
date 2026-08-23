import { describe, it, expect, vi } from "vitest";
import { runNotifications, type Env } from "./index";
import { createTestD1 } from "../../lib/test-d1";
import type { SendOne, SendOutcome, Subscription } from "../../lib/push";

/** 2026-08-23 12:00 UTC = 同日 21:00 JST。設定の時刻と一致させる。 */
const NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function envFor(db: D1Database): Env {
  return {
    DB: db,
    VAPID_PUBLIC_KEY: "public",
    VAPID_PRIVATE_KEY: "private",
    VAPID_SUBJECT: "mailto:test@example.com",
  };
}

/** 送信を記録するだけの偽物。ネットワークに出ない。 */
function recorder(outcome: SendOutcome = "sent") {
  const calls: { subscription: Subscription; payload: string }[] = [];
  return {
    calls,
    send: async (subscription: Subscription, payload: string) => {
      calls.push({ subscription, payload });
      return outcome;
    },
  };
}

async function seedUser(
  db: D1Database,
  options: { userId: string; dueCount: number; hour?: number },
) {
  const { userId, dueCount, hour = 21 } = options;

  await db
    .prepare(
      `INSERT INTO notification_settings (user_id, enabled, hour, time_zone, last_sent_on)
       VALUES (?1, 1, ?2, 'Asia/Tokyo', NULL)`,
    )
    .bind(userId, hour)
    .run();

  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?1, ?2, ?3, 'p256dh', 'auth', ?4)`,
    )
    .bind(`sub-${userId}`, userId, `https://push.example.com/${userId}`, NOW)
    .run();

  for (let i = 0; i < dueCount; i++) {
    const memoId = `memo-${userId}-${i}`;
    const quizId = `quiz-${userId}-${i}`;
    await db
      .prepare(`INSERT INTO memos (id, user_id, content, created_at) VALUES (?1, ?2, ?3, ?4)`)
      .bind(memoId, userId, `メモ本文${i}`, NOW - THREE_DAYS)
      .run();
    await db
      .prepare(
        `INSERT INTO quiz_items (id, memo_id, question, answer, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(quizId, memoId, `問い${i}`, `答え${i}`, NOW - THREE_DAYS)
      .run();
    await db
      .prepare(
        `INSERT INTO review_schedules (quiz_item_id, next_review_at, state)
         VALUES (?1, ?2, '{"stage":0,"recoverTo":null}')`,
      )
      .bind(quizId, NOW - THREE_DAYS)
      .run();
  }
}

async function lastSentOn(db: D1Database, userId: string): Promise<string | null> {
  const rows = await db
    .prepare(`SELECT last_sent_on AS lastSentOn FROM notification_settings WHERE user_id = ?1`)
    .bind(userId)
    .all<{ lastSentOn: string | null }>();
  return rows.results[0]?.lastSentOn ?? null;
}

/**
 * 実行中に例外を握りつぶしていないことを見張る。
 *
 * これが無いと検査として弱い。`if (!due) continue` を消しても、その先で
 * null を触って例外になり try/catch に入るため「送っていない」状態は
 * そのまま成立してしまう。**送らなかったのが判断の結果か、事故かを
 * 区別できるようにする。**
 */
async function runQuietly(env: Env, now: number, send: SendOne): Promise<void> {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runNotifications(env, now, send);
    expect(errors.mock.calls).toEqual([]);
  } finally {
    errors.mockRestore();
  }
}

describe("出題対象が0件の利用者", () => {
  it("時刻が一致していても送らない", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "empty", dueCount: 0 });

    const { calls, send } = recorder();
    await runQuietly(envFor(db), NOW, send);

    expect(calls).toHaveLength(0);
  });

  it("送らなかった日を「送った」と記録しない", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "empty", dueCount: 0 });

    const { send } = recorder();
    await runQuietly(envFor(db), NOW, send);

    // 記録が残ると、その日のうちに問答が期日を迎えても永久に送られない
    expect(await lastSentOn(db, "empty")).toBeNull();
  });

  it("0件の利用者が、他の利用者への配信を止めない", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "empty", dueCount: 0 });
    await seedUser(db, { userId: "has-due", dueCount: 2 });

    const { calls, send } = recorder();
    await runQuietly(envFor(db), NOW, send);

    expect(calls.map((c) => c.subscription.endpoint)).toEqual([
      "https://push.example.com/has-due",
    ]);
  });
});

describe("出題対象がある利用者", () => {
  it("件数と先頭の問いを送り、その日を記録する", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "u1", dueCount: 2 });

    const { calls, send } = recorder();
    await runNotifications(envFor(db), NOW, send);

    expect(calls).toHaveLength(1);
    const payload = calls[0].payload;
    expect(payload).toContain("問い0");
    expect(payload).not.toContain("答え0");
    expect(payload).not.toContain("メモ本文0");
    expect(await lastSentOn(db, "u1")).toBe("2026-08-23");
  });

  it("同じ日に二度起きても一度しか送らない", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "u1", dueCount: 1 });

    const { calls, send } = recorder();
    await runNotifications(envFor(db), NOW, send);
    await runNotifications(envFor(db), NOW, send);

    expect(calls).toHaveLength(1);
  });

  it("時刻が一致しない利用者へは送らない", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "u1", dueCount: 1, hour: 8 });

    const { calls, send } = recorder();
    await runNotifications(envFor(db), NOW, send);

    expect(calls).toHaveLength(0);
  });
});

describe("期限切れの購読", () => {
  it("配信で期限切れと分かった購読を取り除く", async () => {
    const db = createTestD1();
    await seedUser(db, { userId: "u1", dueCount: 1 });

    const { send } = recorder("expired");
    await runNotifications(envFor(db), NOW, send);

    const rows = await db
      .prepare(`SELECT id FROM push_subscriptions WHERE user_id = ?1`)
      .bind("u1")
      .all<{ id: string }>();
    expect(rows.results).toHaveLength(0);
  });
});
