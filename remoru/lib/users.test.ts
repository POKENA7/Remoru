import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { getOrCreateUser, updateNotificationSettings, isValidTimezone } from "./users";

describe("isValidTimezone", () => {
  it("returns true for valid IANA timezone like Asia/Tokyo", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
  });

  it("returns true for UTC", () => {
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("returns false for garbage timezone string", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });

  it("returns false for arbitrary non-timezone strings", () => {
    expect(isValidTimezone("asdf")).toBe(false);
  });
});

describe("getOrCreateUser", () => {
  it("creates a new user with default settings on first call", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_abc");
    expect(user.clerkUserId).toBe("clerk_abc");
    expect(user.notificationHour).toBe(8);
    expect(user.timezone).toBe("UTC");
  });

  it("returns the same user on subsequent calls", async () => {
    const db = createTestDb();
    const first = await getOrCreateUser(db, "clerk_abc");
    const second = await getOrCreateUser(db, "clerk_abc");
    expect(second.id).toBe(first.id);
  });
});

describe("updateNotificationSettings", () => {
  it("updates notification hour and timezone", async () => {
    const db = createTestDb();
    const user = await getOrCreateUser(db, "clerk_abc");
    await updateNotificationSettings(db, user.id, {
      notificationHour: 21,
      timezone: "Asia/Tokyo",
    });
    const updated = await getOrCreateUser(db, "clerk_abc");
    expect(updated.notificationHour).toBe(21);
    expect(updated.timezone).toBe("Asia/Tokyo");
  });
});
