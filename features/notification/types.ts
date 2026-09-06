/**
 * 通知の設定の画面が受け取るもの。`queries.ts` が返し、Container が配る。
 *
 * 読めなかったときは `null`。**画面はそのとき何も出さない**——移す前の
 * `fetch` も、読めなかったら何も出さずに次に開いたとき読み直していた。
 */
export type NotificationPayload = {
  settings: { enabled: boolean; hour: number; timeZone: string };
  selectableHours: number[];
  vapidPublicKey: string | null;
};

/**
 * 通知の書き込みの結果。action と画面の両方が読むのでここに置く。
 *
 * design.md D3: 失敗は**機械が読む語**で返し、文言は画面が持つ。
 */
export type SaveSettingsReason = "hour_out_of_range" | "unknown_time_zone" | "malformed" | "failed";

export type SaveSettingsResult =
  | { ok: true; settings: { enabled: boolean; hour: number; timeZone: string } }
  | { ok: false; reason: SaveSettingsReason };

export type SubscriptionResult = { ok: true } | { ok: false; reason: "malformed" | "failed" };
