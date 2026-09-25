/**
 * `features/import/` の型。**action の結果の型もここに置く**（CLAUDE.md の置き場）。
 *
 * 失敗は機械が読む語で返し、文言は画面が持つ（`features/memo/types.ts` と同じ形）。
 */

/** トークンの名前の長さの上限（文字数）。利用者が見分けられればよい。 */
export const MAX_TOKEN_NAME_LENGTH = 40;

/** トークンの名前の検証の失敗。 */
export type TokenNameError = "empty_name" | "too_long_name";

/** 設定の画面に示すトークン。**ハッシュは含めない。** */
export type ImportTokenView = {
  id: string;
  name: string;
  createdAt: number;
  revokedAt: number | null;
};

export type IssueTokenActionResult =
  | { ok: true; token: string; view: ImportTokenView }
  | { ok: false; reason: TokenNameError | "failed" };

export type RevokeTokenActionResult = { ok: true } | { ok: false; reason: "not_found" | "failed" };
