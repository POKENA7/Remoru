import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { createManualMemo } from "./memos";
import { getOrCreateUser } from "./users";
import {
  upsertPushSubscription,
  removePushSubscriptionByEndpoint,
  getUsersDueForNotification,
} from "./notifications";

describe("upsertPushSubscription", () => {
  it("inserts a new subscription and updates it on re-subscribe", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_1");
    const id1 = await upsertPushSubscription(db, user.id, {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p1", auth: "a1" },
    });
    const id2 = await upsertPushSubscription(db, user.id, {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p2", auth: "a2" },
    });
    expect(id2).toBe(id1);
  });
});

describe("removePushSubscriptionByEndpoint", () => {
  it("deletes the subscription matching the endpoint", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_1");
    await upsertPushSubscription(db, user.id, {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p1", auth: "a1" },
    });
    await removePushSubscriptionByEndpoint(db, "https://push.example/abc");
    const dueUsers = await getUsersDueForNotification(
      db,
      Math.floor(Date.now() / 1000),
    );
    expect(dueUsers).toEqual([]);
  });
});

describe("getUsersDueForNotification", () => {
  it("only includes users whose local hour matches their setting and who have due cards", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);
    const user = await getOrCreateUser(db, "clerk_1");
    const memo = await createManualMemo(db, {
      userId: user.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    const { reviewCards } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(reviewCards)
      .set({ dueDate: now - 1 })
      .where(eq(reviewCards.id, memo.reviewCardId));

    const currentUtcHour = new Date(now * 1000).getUTCHours();
    const { updateNotificationSettings } = await import("./users");
    await updateNotificationSettings(db, user.id, {
      notificationHour: currentUtcHour,
      timezone: "UTC",
    });

    const dueUsers = await getUsersDueForNotification(db, now);
    expect(dueUsers).toEqual([{ userId: user.id, dueCount: 1 }]);
  });

  it("correctly converts a non-UTC timezone to its local hour (Asia/Tokyo, UTC+9)", async () => {
    const db = createTestDb();
    // Fixed instant so the test is deterministic regardless of when it runs:
    // 2024-01-01T03:00:00Z is 12:00 local time in Asia/Tokyo (UTC+9, no DST).
    const now = Math.floor(Date.UTC(2024, 0, 1, 3, 0, 0) / 1000);
    const user = await getOrCreateUser(db, "clerk_tokyo");
    const memo = await createManualMemo(db, {
      userId: user.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    const { reviewCards } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(reviewCards)
      .set({ dueDate: now - 1 })
      .where(eq(reviewCards.id, memo.reviewCardId));

    const { updateNotificationSettings } = await import("./users");
    await updateNotificationSettings(db, user.id, {
      notificationHour: 12,
      timezone: "Asia/Tokyo",
    });

    const dueUsers = await getUsersDueForNotification(db, now);
    expect(dueUsers).toEqual([{ userId: user.id, dueCount: 1 }]);
  });

  it("excludes a non-UTC user whose local hour does not match their setting", async () => {
    const db = createTestDb();
    // Same fixed instant as above: 12:00 local time in Asia/Tokyo.
    const now = Math.floor(Date.UTC(2024, 0, 1, 3, 0, 0) / 1000);
    const user = await getOrCreateUser(db, "clerk_tokyo_2");
    const memo = await createManualMemo(db, {
      userId: user.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    const { reviewCards } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(reviewCards)
      .set({ dueDate: now - 1 })
      .where(eq(reviewCards.id, memo.reviewCardId));

    const { updateNotificationSettings } = await import("./users");
    // Local hour is 12, but the user's notification hour is set to 3 —
    // should NOT match (this would incorrectly pass if timezone were ignored
    // and only the raw UTC hour, 3, were compared).
    await updateNotificationSettings(db, user.id, {
      notificationHour: 3,
      timezone: "Asia/Tokyo",
    });

    const dueUsers = await getUsersDueForNotification(db, now);
    expect(dueUsers).toEqual([]);
  });

  it("skips a user with an invalid timezone instead of throwing for the whole batch", async () => {
    const db = createTestDb();
    const now = Math.floor(Date.now() / 1000);

    const badUser = await getOrCreateUser(db, "clerk_bad_timezone");
    const badMemo = await createManualMemo(db, {
      userId: badUser.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });
    const goodUser = await getOrCreateUser(db, "clerk_good_timezone");
    const goodMemo = await createManualMemo(db, {
      userId: goodUser.id,
      content: "memo",
      question: "Q",
      answer: "A",
    });

    const { reviewCards } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(reviewCards)
      .set({ dueDate: now - 1 })
      .where(eq(reviewCards.id, badMemo.reviewCardId));
    await db
      .update(reviewCards)
      .set({ dueDate: now - 1 })
      .where(eq(reviewCards.id, goodMemo.reviewCardId));

    const { updateNotificationSettings } = await import("./users");
    const currentUtcHour = new Date(now * 1000).getUTCHours();
    await updateNotificationSettings(db, badUser.id, {
      notificationHour: currentUtcHour,
      timezone: "Not/AValidZone",
    });
    await updateNotificationSettings(db, goodUser.id, {
      notificationHour: currentUtcHour,
      timezone: "UTC",
    });

    const dueUsers = await getUsersDueForNotification(db, now);
    expect(dueUsers).toEqual([{ userId: goodUser.id, dueCount: 1 }]);
  });
});
