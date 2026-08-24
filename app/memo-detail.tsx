"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_TAG_NAME_LENGTH } from "@/lib/tag-text";
import { QuizSheet } from "./quiz-sheet";
import { formatDay, type MemoRow, type TagRef } from "./types";

/**
 * メモの詳細。**全画面**（change 7 D1）。通知の設定と同じ形で、上に
 * 「戻る」を置き、下部タブは残す。URL は増やさない。
 *
 * 一覧が持たないものはすべてここにある——問、次回の出題日、問と答への
 * 操作、タグの付け外し、削除。
 *
 * **答えは出さない**（change 7 D5）。開くだけで想起の機会が失われるのは
 * 一覧と同じで、探しに来ただけの利用者から答えを奪わない。
 */
export function MemoDetail({
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
  const [regenerating, setRegenerating] = useState(false);
  const [writing, setWriting] = useState(false);
  /**
   * この画面が持つタグ。
   *
   * 一覧から導くと、**絞り込み中にタグを外したとき、一覧から消えたメモの
   * 古い写しを見続ける**ことになる（外したのに付いたまま見える）。
   * 付け外しはこの画面でしか起きないので、ここで持つのが正しい。
   * メモが変わったときは key で作り直される。
   */
  const [tags, setTags] = useState<TagRef[]>(memo.tags);
  /**
   * この画面が持つ復習の状態。
   *
   * 絞り込み中にタグを外すと、そのメモは一覧から外れて更新が止まる。
   * タグと同じ理由で、この画面で変えるものはこの画面が持つ。
   */
  const [review, setReview] = useState<MemoRow["review"]>(memo.review);
  const backRef = useRef<HTMLButtonElement>(null);

  // 画面が変わったことを読み上げにも伝える。開いた直後の焦点を先頭に置く
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  const current: TagRef | undefined = tags[0];

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
      const { tag } = (await res.json()) as { tag: TagRef };
      setTags([tag]);
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
      setTags([]);
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

  /** 問と答を作り直す。失敗しても以前のものが残るので、画面には出さない。 */
  async function regenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/memos/${memo.id}/quiz-item`, { method: "PUT" });
      if (res.ok) {
        const { question } = (await res.json()) as { question: string | null };
        if (question && review.kind === "scheduled") setReview({ ...review, question });
      }
    } catch {
      // 以前の問答がそのまま残る
    } finally {
      setRegenerating(false);
      onChanged();
    }
  }

  // 付け替えの候補。いま付いているものは出さない。
  const candidates = knownTags.filter((t) => t.id !== current?.id);

  return (
    <div>
      <div className="review-head">
        <button type="button" className="quit" ref={backRef} onClick={onClose}>
          戻る
        </button>
        <span className="counter">メモ</span>
      </div>

      <p className="detail-memo">{memo.content}</p>

      {/* 問と、次回の出題日。**答えは出さない**（design.md D5） */}
      <div className="field">
        <p className="field-label">復習</p>
        {review.kind === "scheduled" ? (
          <>
            <p className="detail-q">問：{review.question}</p>
            <p className="muted">次は {formatDay(review.nextReviewAt)}</p>
            <button
              type="button"
              className="redo"
              disabled={regenerating}
              onClick={() => void regenerate()}
              style={{ marginTop: "0.5rem" }}
            >
              {regenerating ? "つくり直しています..." : "問と答をつくり直す"}
            </button>
          </>
        ) : review.kind === "generating" ? (
          <p className="making">問と答をつくっています</p>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              まだ問と答がありません
            </p>
            <button type="button" className="write-link" onClick={() => setWriting(true)}>
              問と答をつくる →
            </button>
          </>
        )}
      </div>

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

        <div className="detail-foot">
          {confirming ? (
            <>
              <button
                type="button"
                className="btn btn-orange"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? "消しています..." : "ほんとうに消す"}
              </button>
              {/* 確認をやめて詳細に留まる手段。無いと「戻る」しか逃げ道が無い */}
              <button
                type="button"
                className="later"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                やめる
              </button>
            </>
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

      {writing && (
        <QuizSheet
          memoId={memo.id}
          memoContent={memo.content}
          onDone={(created) => {
            setWriting(false);
            setReview({
              kind: "scheduled",
              question: created.question,
              nextReviewAt: created.nextReviewAt,
            });
            onChanged();
          }}
          onLater={() => setWriting(false)}
        />
      )}
    </div>
  );
}
