import { describe, expect, it } from "vitest";
import { createTestDb } from "@/tests/helpers/test-db";
import { authenticateImportHeader } from "./import-auth";
import { issueToken, revokeToken } from "./import-tokens";

/** 取り込みの認証。経路から切り離して、ここで要求の解釈と表の照合を確かめる。 */

const USER = "user_a";

describe("authenticateImportHeader", () => {
  it("トークンから持ち主を返す", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");

    expect(await authenticateImportHeader(`Bearer ${issued.token}`, db)).toEqual({
      userId: USER,
      tokenId: issued.view.id,
    });
  });

  it("ヘッダが無ければ null", async () => {
    const db = createTestDb();
    expect(await authenticateImportHeader(null, db)).toBeNull();
  });

  it("方式が違えば null", async () => {
    const db = createTestDb();
    expect(await authenticateImportHeader("Basic rem_abc", db)).toBeNull();
  });

  it("知らないトークンは null", async () => {
    const db = createTestDb();
    expect(await authenticateImportHeader("Bearer rem_0000", db)).toBeNull();
  });

  it("失効したトークンは null", async () => {
    const db = createTestDb();
    const issued = await issueToken(db, { userId: USER, now: 1 });
    if (!issued.ok) throw new Error("発行できなかった");
    await revokeToken(db, { userId: USER });

    expect(await authenticateImportHeader(`Bearer ${issued.token}`, db)).toBeNull();
  });
});
