import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalHour, runDigest } from "./index";

describe("getLocalHour", () => {
  it("returns the UTC hour", () => {
    const nowTs = Math.floor(Date.UTC(2024, 0, 1, 3, 0, 0) / 1000);
    expect(getLocalHour(nowTs, "UTC")).toBe(3);
  });

  it("converts Asia/Tokyo correctly", () => {
    const nowTs = Math.floor(Date.UTC(2024, 0, 1, 3, 0, 0) / 1000);
    expect(getLocalHour(nowTs, "Asia/Tokyo")).toBe(12);
  });
});

describe("runDigest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips an invalid timezone and still processes the rest", async () => {
    const nowTs = Math.floor(Date.UTC(2024, 0, 1, 3, 0, 0) / 1000);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowTs * 1000));

    try {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("", { status: 200 }));

      const db = createFakeDb([
        {
          id: "bad-user",
          timezone: "Not/AValidZone",
          notification_hour: 3,
        },
        {
          id: "good-user",
          timezone: "UTC",
          notification_hour: 3,
        },
      ]);

      const env = {
        DB: db,
        INTERNAL_API_URL: "https://example.com",
        INTERNAL_SECRET: "secret",
      };

      await expect(runDigest(env)).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "https://example.com/api/internal/send-push",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

function createFakeDb(users: Array<Record<string, unknown>>) {
  return {
    prepare(sql: string) {
      if (sql === "SELECT id, timezone, notification_hour FROM users") {
        return {
          async all<T>() {
            return { results: users as T[] };
          },
        };
      }

      if (sql === "SELECT id FROM review_cards WHERE user_id = ? AND due_date <= ?") {
        return {
          bind(userId: string) {
            return {
              async all<T>() {
                if (userId === "good-user") {
                  return { results: [{ id: "card-1" }] as T[] };
                }
                return { results: [] as T[] };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as D1Database;
}
