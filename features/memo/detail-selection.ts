import type { MemoRow } from "./types";

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
