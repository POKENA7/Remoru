import type { MemoRow } from "./types";

/**
 * 詳細に出すメモを決める。
 *
 * 一覧の配列から探すだけにすると、**絞り込み中にタグを外した瞬間に
 * そのメモが一覧から消え、画面が無言で閉じる**（change 6 のレビュー
 * 軽微-7）。見つかる間は最新のものを使い、消えたら最後に見えていたものを
 * 持ち続ける（design.md D7）。
 *
 * 表示と検査の両方がこれを使う。複製すると、片方だけ直したときに
 * 気づけなくなる（app/cells.ts と同じ考え方）。
 */
export function resolveDetail(
  memos: MemoRow[],
  detailId: string | null,
  lastSeen: MemoRow | null,
): MemoRow | null {
  if (detailId === null) return null;

  const found = memos.find((m) => m.id === detailId) ?? null;
  if (found) return found;

  // 一覧から消えたときだけ、最後に見えていたものを使う。**別のメモを
  // 出さない**ため、id が一致するものに限る。
  return lastSeen && lastSeen.id === detailId ? lastSeen : null;
}

/** 復習の状態を表す読み上げ用の名前。 */
export function stateLabel(kind: MemoRow["review"]["kind"]): string {
  switch (kind) {
    case "scheduled":
      return "復習の予定あり";
    case "generating":
      return "問と答をつくっています";
    case "unwritten":
      return "問と答が未作成";
    default: {
      // kind が増えたら型エラーになる。黙って「未作成」と読ませない
      const never: never = kind;
      throw new Error(`知らない状態: ${String(never)}`);
    }
  }
}
