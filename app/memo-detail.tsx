"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_TAG_NAME_LENGTH } from "@/lib/tag-text";
import { QuizSheet } from "./quiz-sheet";
import { enterTarget, pickerView } from "./tag-picker";
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
  const pickerRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);

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
      setPicking(false);
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
        // 消えていないのでシートは閉じない。押し直せる状態のまま残す
        // （design.md D5）。閉じてから結果が分かる形だと、どこで失敗した
        // のかが分からなくなる。
        setError("消せませんでした。もう一度お試しください");
        return;
      }
      onChanged();
      onClose();
    } catch {
      setError("消せませんでした。もう一度お試しください");
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

  const view = pickerView(knownTags, current?.id, name);

  // 選び手の外に触れたら閉じる。スマホには Escape が無い（design.md D1）
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: PointerEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPicking(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [picking]);

  return (
    <div>
      <div className="review-head">
        {/*
          * 見た目は矢印1文字。**読み上げ名は「戻る」のまま**にする
          * （design.md D2）。文字数を減らすのは目で読む側だけ。
          */}
        <button
          type="button"
          className="quit back"
          aria-label="戻る"
          ref={backRef}
          onClick={onClose}
        >
          ←
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
              {regenerating ? "つくり直しています..." : "つくり直す"}
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
          <p className="field-label">タグ</p>

          {picking ? (
            <div className="picker" ref={pickerRef}>
              <input
                id="tag-input"
                /*
                 * iOS は欄の id や name に "name" が入っていると連絡先の
                 * 名前欄だと推測し、「連絡先を自動入力」を出してくる。
                 */
                name="tag"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setPicking(false);
                    return;
                  }
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const target = enterTarget(knownTags, name);
                  if (target) void assign(target);
                }}
                placeholder="さがす / つくる"
                maxLength={MAX_TAG_NAME_LENGTH}
                disabled={busy}
              />

              {/*
                * 候補と「つくる」を同じ一覧に並べる。**どちらも押せる行**で、
                * 利用者が「作る」か「選ぶ」かを先に決める必要は無い。
                */}
              <div className="picker-list">
                {view.matches.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="picker-row"
                    disabled={busy}
                    onClick={() => void assign(t.name)}
                  >
                    {t.name}
                  </button>
                ))}
                {view.createName && (
                  <button
                    type="button"
                    className="picker-row picker-new"
                    disabled={busy}
                    onClick={() => void assign(view.createName!)}
                  >
                    ＋「{view.createName}」をつくる
                  </button>
                )}
                {view.matches.length === 0 && !view.createName && (
                  <p className="picker-empty">見つかりません</p>
                )}
              </div>
            </div>
          ) : current ? (
            /* × は外す、それ以外は開く。当たり判定を分ける（design.md D1） */
            <span className="tag tag-chip">
              <button
                type="button"
                className="tag-open"
                disabled={busy}
                aria-expanded={false}
                onClick={() => setPicking(true)}
              >
                {current.name}
              </button>
              <button
                type="button"
                className="tag-x"
                aria-label="タグを外す"
                disabled={busy}
                onClick={() => void unassign(current.id)}
              >
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="tag tag-add"
              disabled={busy}
              aria-expanded={false}
              onClick={() => setPicking(true)}
            >
              ＋ タグ
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="detail-foot">
          <button
            type="button"
            className="later"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            消す
          </button>
        </div>

        {/*
          * 確認はシートで出す（design.md D4）。要点は見た目ではなく位置で、
          * **起動した「消す」と実行の「消す」が同じ場所に出ない**こと。
          * 同じ位置だと、続けて二度触れただけで消える（spec の要件）。
          */}
        {confirming && (
          <div className="sheet-backdrop" role="dialog" aria-label="メモを消す">
            <div className="sheet">
              <div className="grip" />
              <p className="sheet-label">このメモを消しますか</p>
              <p className="sheet-memo">{memo.content}</p>
              <p className="hint">問と答、復習の記録も一緒に消えます。戻せません</p>

              {error && <p className="error">{error}</p>}

              <div className="sheet-foot">
                <button
                  type="button"
                  className="btn btn-orange"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? "消しています..." : "消す"}
                </button>
                <button
                  type="button"
                  className="later"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setError(null);
                  }}
                >
                  やめる
                </button>
              </div>
            </div>
          </div>
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
