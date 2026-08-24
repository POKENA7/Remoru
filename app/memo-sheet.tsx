"use client";

import { useState } from "react";
import { MAX_TAG_NAME_LENGTH } from "@/lib/tag-text";
import type { MemoRow, TagRef } from "./types";

/**
 * メモの詳細。下からせり上がるシート（design.md D3）。
 *
 * ここで行うのはタグの付け外しと削除だけ。下部タブは2つのままで、
 * URL も増やさない。
 *
 * **削除はここにしかない**（design.md D4）。一覧の行にはタグと復習状態が
 * 並ぶので、取り消せない操作を同じ行から外している。
 */
export function MemoSheet({
  memo,
  knownTags,
  onChanged,
  onClose,
}: {
  memo: MemoRow;
  knownTags: { id: string; name: string }[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const current: TagRef | undefined = memo.tags[0];

  async function assign(tagName: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/memos/${memo.id}/tag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagName }),
      });
      if (!res.ok) {
        setError("つけられませんでした。もう一度お試しください");
        return;
      }
      setName("");
      onChanged();
    } catch {
      setError("つけられませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(tagId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/memos/${memo.id}/tag`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) {
        setError("外せませんでした。もう一度お試しください");
        return;
      }
      onChanged();
    } catch {
      setError("外せませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/memos/${memo.id}`, { method: "DELETE" });
      if (!res.ok) {
        // 消えていないので閉じない。押し直せる状態のまま残す。
        setError("消せませんでした。もう一度お試しください");
        setConfirming(false);
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError("消せませんでした。もう一度お試しください");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  // 付け替えの候補。いま付いているものは出さない。
  const candidates = knownTags.filter((t) => t.id !== current?.id);

  return (
    <div className="sheet-backdrop" role="dialog" aria-label="メモの詳細">
      <div className="sheet">
        <div className="grip" />
        <p className="sheet-label">メモ</p>
        <p className="sheet-memo">{memo.content}</p>

        <div className="field">
          <label htmlFor="tag-input">タグ</label>
          {current ? (
            <p className="tag-row">
              <span className="tag">{current.name}</span>
              <button
                type="button"
                className="redo"
                disabled={busy}
                onClick={() => void unassign(current.id)}
              >
                外す
              </button>
            </p>
          ) : (
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              まだついていません
            </p>
          )}

          <form
            className="tag-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void assign(name);
            }}
          >
            <input
              id="tag-input"
              /*
               * iOS は欄の id や name に "name" が入っていると連絡先の
               * 名前欄だと推測し、「連絡先を自動入力」を出してくる。
               * 自動補完も補正も要らない欄なので、すべて切る。
               */
              name="tag"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={current ? "つけかえる" : "ひとことで"}
              maxLength={MAX_TAG_NAME_LENGTH}
              disabled={busy}
            />
            {/*
             * 決定のボタンを置く。ソフトウェアキーボードだけに頼ると、
             * 確定する手段が無い端末がある（実機の iPhone で確認）。
             */}
            <button
              type="submit"
              className="btn btn-blue"
              disabled={busy || name.trim().length === 0}
            >
              つける
            </button>
          </form>

          {candidates.length > 0 && (
            <div className="tag-choices">
              {candidates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tag tag-pick"
                  disabled={busy}
                  onClick={() => void assign(t.name)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {current && (
            <p className="hint" style={{ marginTop: "0.5rem" }}>
              つけかえると、いまのタグは外れます
            </p>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="sheet-foot">
          <button type="button" className="btn btn-plain" onClick={onClose}>
            とじる
          </button>
          {confirming ? (
            <button
              type="button"
              className="btn btn-orange"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "消しています..." : "ほんとうに消す"}
            </button>
          ) : (
            <button
              type="button"
              className="later"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              このメモを消す
            </button>
          )}
        </div>
        {confirming && (
          <p className="hint" style={{ marginTop: "0.6rem" }}>
            問と答、復習の記録も一緒に消えます。戻せません
          </p>
        )}
      </div>
    </div>
  );
}
