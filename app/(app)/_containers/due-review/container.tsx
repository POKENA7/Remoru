import { getNotificationSettings } from "@/features/notification/queries";
import { ReviewScreen } from "@/features/review/components/review-screen";
import { getDue } from "@/features/review/queries";

/**
 * その日の復習。取得だけを行い、表示と操作は features/review に渡す。
 *
 * **通知の設定もここで読む**（design.md D8）。設定は復習から開く画面で、
 * 固有の経路を持たない。開いてから取りに行くと「読み込み中」が挟まるので、
 * この経路の取得に相乗りさせる（依存が無いので並行に走る）。
 *
 * **失敗は別々に受ける。** 1 つの try で包むと、通知の設定が読めなかっただけで
 * 復習の一覧まで空になる。無関係な 2 つなので、倒れる範囲も分ける。
 *
 * 読めなかったときに空で渡すのは、移す前の `fetch` もそうしていたため。
 * **これは途中の形である**（`error.tsx` を置いたら任せる）。
 */
export async function DueReviewContainer() {
  const [items, notification] = await Promise.all([
    getDue().catch((error) => {
      console.error("復習の一覧を読めなかった", error);
      return [];
    }),
    getNotificationSettings().catch((error) => {
      console.error("通知の設定を読めなかった", error);
      return null;
    }),
  ]);

  return <ReviewScreen items={items} notification={notification} />;
}
