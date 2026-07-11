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
});
