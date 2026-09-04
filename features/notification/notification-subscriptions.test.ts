import { describe, expect, it } from "vitest";
import {
  deleteSubscription,
  listSubscriptions,
  saveSubscription,
  validateSubscription,
} from "./notification-subscriptions";
import { createTestDb } from "@/lib/test-db";

const ENDPOINT_A = "https://push.example.com/a";
const ENDPOINT_B = "https://push.example.com/b";

function sub(endpoint: string, keys = { p256dh: "key", auth: "auth" }) {
  return { endpoint, ...keys };
}

describe("購読の保存", () => {
  it("同じ送信先を2回保存しても1件にしかならない", async () => {
    const db = createTestDb();

    await saveSubscription(db, {
      userId: "u1",
      subscription: sub(ENDPOINT_A),
      now: 1,
    });
    await saveSubscription(db, {
      userId: "u1",
      subscription: sub(ENDPOINT_A, { p256dh: "key2", auth: "auth2" }),
      now: 2,
    });

    const rows = await listSubscriptions(db, "u1");
    expect(rows).toHaveLength(1);
    // 鍵は入れ替わる。端末が購読し直すと鍵も変わるため。
    expect(rows[0].p256dh).toBe("key2");
  });

  it("別の送信先は別の行として持つ（複数の端末）", async () => {
    const db = createTestDb();

    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_A), now: 1 });
    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_B), now: 2 });

    expect(await listSubscriptions(db, "u1")).toHaveLength(2);
  });

  it("同じ送信先を別の利用者が保存すると、持ち主が移り行は増えない", async () => {
    const db = createTestDb();

    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_A), now: 1 });
    await saveSubscription(db, { userId: "u2", subscription: sub(ENDPOINT_A), now: 2 });

    // 同じブラウザで別の利用者がサインインした場合。2件になると
    // その端末に二人ぶんの通知が届く。
    expect(await listSubscriptions(db, "u1")).toHaveLength(0);
    expect(await listSubscriptions(db, "u2")).toHaveLength(1);
  });
});

describe("購読の分離", () => {
  it("他の利用者の購読は取得できない", async () => {
    const db = createTestDb();

    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_A), now: 1 });
    await saveSubscription(db, { userId: "u2", subscription: sub(ENDPOINT_B), now: 2 });

    const u1 = await listSubscriptions(db, "u1");
    expect(u1).toHaveLength(1);
    expect(u1[0].endpoint).toBe(ENDPOINT_A);

    const u2 = await listSubscriptions(db, "u2");
    expect(u2).toHaveLength(1);
    expect(u2[0].endpoint).toBe(ENDPOINT_B);
  });

  it("他の利用者の購読は削除できない", async () => {
    const db = createTestDb();

    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_A), now: 1 });

    const removed = await deleteSubscription(db, {
      userId: "u2",
      endpoint: ENDPOINT_A,
    });

    expect(removed).toBe(false);
    expect(await listSubscriptions(db, "u1")).toHaveLength(1);
  });

  it("自分の購読は削除できる", async () => {
    const db = createTestDb();

    await saveSubscription(db, { userId: "u1", subscription: sub(ENDPOINT_A), now: 1 });

    expect(await deleteSubscription(db, { userId: "u1", endpoint: ENDPOINT_A })).toBe(true);
    expect(await listSubscriptions(db, "u1")).toHaveLength(0);
  });
});

describe("要求の検証", () => {
  it("欠けた値を受け付けない", () => {
    expect(validateSubscription(null)).toBeNull();
    expect(validateSubscription({ endpoint: ENDPOINT_A })).toBeNull();
    expect(validateSubscription({ endpoint: "", p256dh: "k", auth: "a" })).toBeNull();
    expect(validateSubscription({ endpoint: ENDPOINT_A, p256dh: "k", auth: "a" })).toEqual({
      endpoint: ENDPOINT_A,
      p256dh: "k",
      auth: "a",
    });
  });
});
