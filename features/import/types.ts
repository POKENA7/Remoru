/**
 * `features/import/` の型。**action の結果の型もここに置く**（CLAUDE.md の置き場）。
 *
 * 失敗は機械が読む語で返し、文言は画面が持つ（`features/memo/types.ts` と同じ形）。
 */

/**
 * 設定の画面に示すトークン。**ハッシュは含めない。**
 *
 * 利用者ごとに1個なので、一覧ではなく「有無と発行日」だけを返す（design D2）。
 */
export type ImportTokenView = {
  id: string;
  createdAt: number;
};

/**
 * 画面に渡すトークンの状態。
 *
 * **「読めなかった」と「無い」を別の値にする。** 発行は古い行を消してから
 * 作るので（design D2）、読めなかっただけの利用者に発行させると、有効な
 * トークンを消してしまう。`token: null` は「無い」、`status: "error"` は
 * 「読めなかった」である。
 */
export type ImportTokenState =
  | { status: "ok"; token: ImportTokenView | null }
  | { status: "error" };

export type IssueTokenActionResult =
  | { ok: true; token: string; view: ImportTokenView }
  | { ok: false; reason: "failed" };

export type RevokeTokenActionResult = { ok: true } | { ok: false; reason: "not_found" | "failed" };
