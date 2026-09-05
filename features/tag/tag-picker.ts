import { validateTagName } from "./tag-text";

export type TagOption = { id: string; name: string };

export type PickerView = {
  /** 打った内容で絞り込んだ候補。いま付いているものは除く。 */
  matches: TagOption[];
  /**
   * 新しく作れる名前。作れないときは null。
   *
   * **完全に一致する既存のタグがあるときは作らせない**（spec の要件）。
   * 同じ名前のタグが2つできる余地を画面から消す。
   */
  createName: string | null;
};

/**
 * タグの選び手に出すものを決める。
 *
 * 名前の正規化は `validateTagName` に任せる。**画面と保存で判定がずれると、
 * 「つくる」を押したのに既存が選ばれる**（あるいはその逆）ことになる。
 *
 * 表示とテストの両方がこれを使う（app/cells.ts と同じ考え方）。
 */
export function pickerView(
  all: TagOption[],
  currentId: string | undefined,
  rawQuery: string,
): PickerView {
  const validated = validateTagName(rawQuery);
  const query = validated.ok ? validated.name : "";

  const matches = all.filter((t) => t.id !== currentId && (query === "" || t.name.includes(query)));

  const exists = all.some((t) => t.name === query);
  return { matches, createName: query !== "" && !exists ? query : null };
}

/**
 * `Enter` を押したときに選ばれる名前。
 *
 * 完全に一致するものがあればそれを、無ければ打った名前をそのまま返す。
 * 候補まで移動しなくても確定できるようにする。
 */
export function enterTarget(all: TagOption[], rawQuery: string): string | null {
  const validated = validateTagName(rawQuery);
  if (!validated.ok) return null;

  const exact = all.find((t) => t.name === validated.name);
  return exact ? exact.name : validated.name;
}
