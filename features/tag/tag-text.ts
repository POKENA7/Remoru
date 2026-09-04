/**
 * タグの名前そのものに関する規則。
 *
 * **このファイルは何も import しない。** 手で付けたタグも、提案されたタグも、
 * 同じ検証を通す必要がある。提案側（lib/tag-suggestion.ts）は D1 を知らない
 * 層なので、共有できる形はここに置くしかない（lib/quiz-text.ts と同じ理由）。
 */

/** タグ名の長さ上限（文字数）。一覧の行に収まる長さ。 */
export const MAX_TAG_NAME_LENGTH = 20;

/**
 * 1件のメモが持てるタグの数。
 *
 * **1に絞っているのはここだけ。** 表（`memo_tags`）は多対多のまま置いて
 * あるので、この値を増やせば複数持てるようになる。スキーマもマイグレー
 * ションも触らずに済む（design.md D2）。
 *
 * この層に置いてあるのは、提案側（lib/tag-suggestion.ts）からも読める
 * ようにするため。あちらは D1 を知らないので lib/tags.ts を引けない。
 * 定数がそこに閉じていると、「1」が2箇所に散る。
 */
export const MAX_TAGS_PER_MEMO = 1;

export type TagNameError = "empty_name" | "too_long";

export type ValidatedTagName = { ok: true; name: string } | { ok: false; error: TagNameError };

/**
 * タグ名を検証して正規化する。
 *
 * 前後の空白は落とす。落とさないと「 仕事」と「仕事」が別のタグになり、
 * 絞り込みが分裂する。
 */
export function validateTagName(raw: string): ValidatedTagName {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "empty_name" };
  if ([...name].length > MAX_TAG_NAME_LENGTH) return { ok: false, error: "too_long" };
  return { ok: true, name };
}
