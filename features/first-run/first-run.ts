import { eq, isNull } from "drizzle-orm";
import { firstRunState } from "../../db/schema";
import type { AppDb } from "../../db/types";

/**
 * 初回の導きの状態。
 *
 * **持ち物の数では代用できない。** メモ0件には「初めて開いた人」と
 * 「全部消した人」の2つがあり、後者はもう使い方を知っている（design.md D1）。
 */

/** この利用者が導きを終えているか。 */
export async function hasFinishedGuide(db: AppDb, userId: string): Promise<boolean> {
  const rows = await db
    .select({ guidedAt: firstRunState.guidedAt })
    .from(firstRunState)
    .where(eq(firstRunState.userId, userId));
  return rows[0]?.guidedAt != null;
}

/**
 * 導きを終えたものとして記録する。
 *
 * 既に終えていれば時刻を上書きしない。**終えた時点を残すため**であり、
 * 押し直しや再読み込みで後ろへずれると、いつ初めて見せたかが分からなくなる。
 */
export async function finishGuide(
  db: AppDb,
  params: { userId: string; now: number },
): Promise<void> {
  await db
    .insert(firstRunState)
    .values({ userId: params.userId, guidedAt: params.now })
    // 既に終えていれば時刻を動かさない。ただし **guided_at が NULL の行は
    // 埋める**。「行があるなら終えている」と決め打つと、何らかの理由で
    // NULL の行が立ったときに、二度と終えられなくなる。
    .onConflictDoUpdate({
      target: firstRunState.userId,
      set: { guidedAt: params.now },
      setWhere: isNull(firstRunState.guidedAt),
    });
}
