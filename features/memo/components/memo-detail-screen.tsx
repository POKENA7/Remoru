"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { MemoRow } from "../types";
import { MemoDetail } from "./memo-detail";

/**
 * メモの詳細の画面。**取得はしない**（design.md D2）。
 *
 * 閉じるのは履歴を戻る。押して来た一覧へ返るので、**絞り込みも
 * スクロール位置もブラウザが復元する**（navigation spec
 * 「戻る操作は直前に見ていた画面へ返す」）。自前で控えなくてよい。
 */
export function MemoDetailScreen({
  memo,
  knownTags,
}: {
  memo: MemoRow;
  knownTags: { id: string; name: string; count: number }[];
}) {
  const router = useRouter();

  /**
   * 消したときは戻るのではなく一覧へ送る。
   *
   * 戻ると、消したメモの経路が履歴に残っているので「見つかりません」に
   * 当たる場合がある。
   */
  const close = useCallback(() => router.back(), [router]);
  const refresh = useCallback(() => router.refresh(), [router]);

  return (
    <MemoDetail
      memo={memo}
      knownTags={knownTags}
      onChanged={refresh}
      onClose={close}
      onDeleted={() => router.replace("/")}
    />
  );
}
