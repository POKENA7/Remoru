import { describe, expect, it } from "vitest";
import { BATCH_SIZE } from "../../cli/api";
import { MAX_IMPORT_ITEMS } from "@/features/import/import-api";

/**
 * CLI が1回に送る件数と、API が1回に受け付ける件数の上限を一致させる。
 *
 * **別々の場所に書いてある値である。** CLI は独立したパッケージなので
 * `features/import/` を import できない（design D7）。サーバー側だけを
 * 変えると、CLI は黙って400の部分失敗を返し始める。ここで気づけるようにする。
 */
describe("CLI の分割と API の上限", () => {
  it("同じ値である", () => {
    expect(BATCH_SIZE).toBe(MAX_IMPORT_ITEMS);
  });
});
