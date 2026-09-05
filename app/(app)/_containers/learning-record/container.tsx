import { RecordTab } from "@/features/record/components/record-tab";
import { getLearningRecord } from "@/features/record/queries";

/**
 * おぼえてきたこと。取得だけを行い、表示は features/record に渡す。
 *
 * **読めなかったときは `null` を渡す。** 例外をそのまま投げると Next.js の
 * 既定のエラー画面に落ち、`RecordTab` の「見出しだけでも残す」分岐
 * （design.md D2: 真っ白にしない）に到達しない。移す前の `fetch` も
 * 失敗を捕まえて同じ形にしていた。
 *
 * **これは途中の形である。** `error.tsx` を置いたら（次の change）、
 * 捕まえるのをやめてそちらに任せる。
 */
export async function LearningRecordContainer() {
  try {
    const record = await getLearningRecord();
    return <RecordTab record={record} />;
  } catch (error) {
    console.error("おぼえてきたことを読めなかった", error);
    return <RecordTab record={null} />;
  }
}
