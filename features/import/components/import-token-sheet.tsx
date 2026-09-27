"use client";

import { useState } from "react";
import { formatDay } from "@/features/memo/types";
import { Sheet } from "@/features/sheet/sheet";
import { createImportToken, discardImportToken } from "../actions";
import type { ImportTokenState } from "../types";

/**
 * 取り込みトークンの設定。**取得はしない**（design D10）。
 *
 * トークンはメモの一覧の描画でサーバーが読み、props で届く。利用者ごとに
 * 1個なので、一覧ではなく有無を示す（design D2）。
 *
 * 外枠は共通の `<Sheet>` を使う。閉じる手段（外側・引く・ボタン・Escape）と
 * 焦点の復帰を1箇所に持つためである（`sheet` の要件）。
 *
 * **この画面は第二段階の途中である**——`/settings/api` への移動と、再発行・
 * 失効の確認は 7.6 で行う。
 */
export function ImportTokenSheet({
  tokenState,
  onClose,
}: {
  /**
   * トークンの状態。**「読めなかった」を「無い」と混ぜない。**
   * 読めなかったときに発行を出すと、有効なトークンを消させてしまう（design D2）。
   */
  tokenState: ImportTokenState;
  onClose: () => void;
}) {
  /** いま発行した平文。**この画面を閉じると消える。** サーバーには残らない */
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function issue(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setIssued(null);

    try {
      const result = await createImportToken();
      if (!result.ok) {
        setNotice("発行できませんでした。もう一度お試しください");
        return;
      }
      setIssued(result.token);
    } catch {
      // action に辿り着けない失敗（圏外・配備後の古い識別子）
      setNotice("発行できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);

    try {
      const result = await discardImportToken();
      if (!result.ok) {
        setNotice(
          result.reason === "not_found"
            ? "このトークンは見つかりませんでした"
            : "失効できませんでした。もう一度お試しください",
        );
        return;
      }
      // 1人1個なので、失効は直前に発行した平文も無効にする。残すと複写して401になる
      setIssued(null);
    } catch {
      setNotice("失効できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  /** 読めたときだけ操作を出す。読めなかったときは発行も失効もさせない */
  const token = tokenState.status === "ok" ? tokenState.token : null;
  const readable = tokenState.status === "ok";

  return (
    <Sheet label="AIとつなぐ" onClose={onClose}>
      <p className="sheet-label">AIとつなぐ</p>
      <p className="muted">コマンドを実行するAIから、メモを登録できるようにします。</p>

      <div className="field">
        <p className="field-label">発行済み</p>
        {!readable ? (
          <p className="muted">いま読めませんでした。開き直してください</p>
        ) : token === null ? (
          <p className="muted">まだありません</p>
        ) : (
          <p className="muted">発行日 {formatDay(token.createdAt)}</p>
        )}
      </div>

      {issued !== null && (
        <div className="field">
          <p className="token-plain">{issued}</p>
          <p className="hint">この文字列は一度しか出ません。閉じると読めなくなります</p>
        </div>
      )}

      {notice !== null && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}

      {readable && (
        <div className="field">
          <div className="token-issue">
            <button
              type="button"
              className="btn btn-orange"
              disabled={busy}
              onClick={() => void issue()}
            >
              {token === null ? "発行" : "再発行"}
            </button>
            {token !== null && (
              <button
                type="button"
                className="btn btn-plain"
                disabled={busy}
                onClick={() => void revoke()}
              >
                失効
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sheet-foot">
        <button type="button" className="btn btn-plain" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Sheet>
  );
}
