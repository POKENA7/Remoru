"use client";

import { useState } from "react";
import { formatDay } from "@/features/memo/types";
import { Sheet } from "@/features/sheet/sheet";
import { createImportToken, discardImportToken } from "../actions";
import { MAX_TOKEN_NAME_LENGTH, type ImportTokenView } from "../types";

/**
 * 取り込みトークンの設定。**取得はしない**（design D10）。
 *
 * トークンはメモの一覧の描画でサーバーが読み、props で届く。
 *
 * 外枠は共通の `<Sheet>` を使う。閉じる手段（外側・引く・ボタン・Escape）と
 * 焦点の復帰を1箇所に持つためである（`sheet` の要件）。
 */
export function ImportTokenSheet({
  tokens,
  onClose,
}: {
  /** 発行済みのトークン。ハッシュは含まれない。読めなかったときは null */
  tokens: ImportTokenView[] | null;
  onClose: () => void;
}) {
  /** いま発行した平文。**この画面を閉じると消える。** サーバーには残らない */
  const [issued, setIssued] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 失効の確認を出しているトークン。同じ位置の二度押しで消えないようにする */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function issue(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setIssued(null);

    try {
      const result = await createImportToken(name);
      if (!result.ok) {
        setNotice(
          result.reason === "empty_name"
            ? "名前を入力してください"
            : result.reason === "too_long_name"
              ? `名前は${MAX_TOKEN_NAME_LENGTH}文字までです`
              : "発行できませんでした。もう一度お試しください",
        );
        return;
      }
      setIssued(result.token);
      setName("");
    } catch {
      // action に辿り着けない失敗（圏外・配備後の古い識別子）
      setNotice("発行できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);

    try {
      const result = await discardImportToken(tokenId);
      if (!result.ok) {
        setNotice(
          result.reason === "not_found"
            ? "このトークンは見つかりませんでした"
            : "失効できませんでした。もう一度お試しください",
        );
        return;
      }
      setConfirmingId(null);
    } catch {
      setNotice("失効できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  const canIssue = !busy && name.trim().length > 0;

  return (
    <Sheet label="AIとつなぐ" onClose={onClose}>
      <p className="sheet-label">AIとつなぐ</p>
      <p className="muted">コマンドを実行するAIから、メモを登録できるようにします。</p>

      <div className="field">
        <p className="field-label">新しく発行する</p>
        <div className="token-issue">
          <input
            className="input"
            value={name}
            placeholder="名前（MacBook など）"
            aria-label="トークンの名前"
            maxLength={MAX_TOKEN_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-orange"
            disabled={!canIssue}
            onClick={() => void issue()}
          >
            発行
          </button>
        </div>

        {issued !== null && (
          <>
            <p className="token-plain">{issued}</p>
            <p className="hint">この文字列は一度しか出ません。閉じると読めなくなります</p>
          </>
        )}

        {notice !== null && (
          <p className="error" role="alert">
            {notice}
          </p>
        )}
      </div>

      <div className="field">
        <p className="field-label">発行済み</p>
        {tokens === null ? (
          <p className="muted">いま読めませんでした。開き直してください</p>
        ) : tokens.length === 0 ? (
          <p className="muted">まだありません</p>
        ) : (
          <ul className="token-list">
            {tokens.map((token) =>
              confirmingId === token.id ? (
                <li key={token.id} className="token-row">
                  <div>
                    <b>{token.name}</b>
                    <p className="muted">失効しますか。元に戻せません</p>
                  </div>
                  <span className="token-actions">
                    <button
                      type="button"
                      className="btn btn-plain"
                      disabled={busy}
                      onClick={() => void revoke(token.id)}
                    >
                      失効する
                    </button>
                    <button
                      type="button"
                      className="btn btn-plain"
                      disabled={busy}
                      onClick={() => setConfirmingId(null)}
                    >
                      やめる
                    </button>
                  </span>
                </li>
              ) : (
                <li key={token.id} className="token-row">
                  <div>
                    <b>{token.name}</b>
                    <p className="muted">
                      {token.revokedAt === null ? formatDay(token.createdAt) : "失効済み"}
                    </p>
                  </div>
                  {token.revokedAt === null && (
                    <button
                      type="button"
                      className="btn btn-plain"
                      disabled={busy}
                      onClick={() => setConfirmingId(token.id)}
                    >
                      失効
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="sheet-foot">
        <button type="button" className="btn btn-plain" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Sheet>
  );
}
