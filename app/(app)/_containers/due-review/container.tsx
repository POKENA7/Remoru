import { ReviewScreen } from "@/features/review/components/review-screen";
import { getDue } from "@/features/review/queries";

/**
 * その日の復習。取得だけを行い、表示と操作は features/review に渡す。
 *
 * 読めなかったときは空で渡す——移す前の `fetch` も失敗を捕まえて
 * そうしていた。**これは途中の形である**（`error.tsx` を置いたら任せる）。
 */
export async function DueReviewContainer() {
  try {
    const items = await getDue();
    return <ReviewScreen items={items} />;
  } catch (error) {
    console.error("復習の一覧を読めなかった", error);
    return <ReviewScreen items={[]} />;
  }
}
