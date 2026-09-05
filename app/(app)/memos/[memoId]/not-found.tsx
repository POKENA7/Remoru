import Link from "next/link";

/**
 * そのメモが無いとき（消したあと、または他人のもの）。
 *
 * `memo-capture` spec「削除したメモの詳細を開き直す」: 無いことを示し、
 * 一覧へ戻る手段を提供する。**真っ白にしない**（design.md D2）。
 */
export default function MemoNotFound() {
  return (
    <div>
      <h2 className="section-head">見つかりません</h2>
      <p className="muted">このメモは消えているようです。</p>
      <p>
        <Link href="/">メモの一覧へ</Link>
      </p>
    </div>
  );
}
