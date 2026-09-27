"use client";

import { useState } from "react";
import { formatDay } from "@/features/memo/types";
import { createImportToken, discardImportToken } from "../actions";
import type { ImportTokenState } from "../types";

/**
 * API トークンの設定（`/settings/api`）。**取得はしない。**
 *
 * 読み取りはこの経路の Server Component が行い、props で届く（design D10）。
 * メモの一覧の描画では読まない——開く人の少ない画面のために、全員の初期
 * 表示に取得を足していたのをやめた。
 *
 * 示すのは有無と発行日だけ（design D2）。操作は「発行」「再発行」「失効」。
 * **再発行と失効は、使っている CLI が動かなくなる**ので確認を1回挟む。
 * 初回の発行には確認を要さない。
 *
 * この画面はシートではない（design D10）。経路そのものが画面で、戻り道は
 * 下部のタブである。
 */

/** 確認中の操作。`null` は確認していない状態。 */
type Confirm = "reissue" | "revoke" | null;

export function ImportTokenSettings({ tokenState }: { tokenState: ImportTokenState }) {
  /** いま発行した平文。**この画面を離れると消える。** サーバーには残らない */
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function issue(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    // 再発行では古い平文を新しい平文で置き換える。古いものを残さない
    setIssued(null);
    setConfirm(null);

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
    setConfirm(null);

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
  const readable = tokenState.status === "ok";
  const token = readable ? tokenState.token : null;

  return (
    <div>
      <h2 className="section-head">API トークン</h2>
      <p className="muted">コマンドを実行するAIから、メモを登録できるようにします。</p>

      <div className="field" style={{ marginTop: "1.25rem" }}>
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
          <p className="hint">この文字列は一度しか出ません。ほかの画面へ移ると読めなくなります</p>
        </div>
      )}

      {notice !== null && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}

      {readable && (
        <div className="field">
          {confirm === null ? (
            <div className="token-issue">
              <button
                type="button"
                className="btn btn-orange"
                disabled={busy}
                onClick={() => {
                  // 初回の発行には確認を挟まない。手元に有効なトークンが無いため
                  if (token === null) void issue();
                  else setConfirm("reissue");
                }}
              >
                {token === null ? "発行" : "再発行"}
              </button>
              {token !== null && (
                <button
                  type="button"
                  className="btn btn-plain"
                  disabled={busy}
                  onClick={() => setConfirm("revoke")}
                >
                  失効
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="muted">
                {confirm === "revoke"
                  ? "本当に失効しますか。使っている CLI は動かなくなります"
                  : "本当に再発行しますか。使っている CLI は動かなくなり、新しいトークンを入れ直すことになります"}
              </p>
              {/* 確認中はもう一方の操作を出さない。二重送信もしない（busy） */}
              <div className="token-issue" style={{ marginTop: "0.7rem" }}>
                <button
                  type="button"
                  className="btn btn-orange"
                  disabled={busy}
                  onClick={() => void (confirm === "revoke" ? revoke() : issue())}
                >
                  {busy ? "..." : confirm === "revoke" ? "失効する" : "再発行する"}
                </button>
                <button
                  type="button"
                  className="later"
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  やめる
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
