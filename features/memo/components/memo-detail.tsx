"use client";

import { useEffect, useRef, useState } from "react";
import { removeMemo } from "../actions";
import { assignTag, unassignTag } from "@/features/tag/actions";
import { MAX_TAG_NAME_LENGTH } from "@/features/tag/tag-text";
import { QuizSheet } from "@/features/quiz/components/quiz-sheet";
import { Sheet } from "@/features/sheet/sheet";
import { enterTarget, pickerView } from "@/features/tag/tag-picker";
import { formatDay, type MemoRow, type TagRef } from "../types";

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
  answer: initialAnswer,
  onClose,
  onDeleted,
}: {
  memo: MemoRow;
  knownTags: { id: string; name: string }[];
  /** そのメモの答え。問答を持たないメモでは null（design.md D7） */
  answer: string | null;
  onClose: () => void;
  /**
   * 消したあとの行き先。**閉じるのとは分ける。**
   * 履歴を戻ると、消したメモの経路に当たって「見つかりません」が出る。
   */
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);
  /** 作るのか直すのか。鉛筆は直す、「問と答をつくる →」は作る */
  const [writingMode, setWritingMode] = useState<"create" | "rewrite">("rewrite");
  /**
   * 答え。**サーバーが最初の描画で渡してくる**（design.md D7）。
   *
   * 一覧の取得には載っていない（載せるとメモの数だけ答えを運ぶ）ので、
   * 詳細の Container が 1 件だけ引いている。以前はここから `useEffect` で
   * 追いかけて取っており、答えの行と鉛筆が一拍遅れて現れていた。
   *
   * 状態として持つのは、**この画面で書き直せる**ため。書き直したあとは
   * ここが最新になる（他のローカルの写しと同じ理由）。
   */
  const [answer, setAnswer] = useState<string | null>(initialAnswer);
  /**
   * この画面が持つ本文。
   *
   * タグや復習の状態と同じ理由（絞り込み中に一覧から外れて更新が止まる）で、
   * この画面で変えるものはこの画面が持つ。
   */
  const [content, setContent] = useState(memo.content);
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
      const result = await assignTag(memo.id, tagName);
      if (!result.ok) {
        setError("つけられませんでした。もう一度お試しください");
        return;
      }
      // 一覧の取り直しは action の中の `refresh()` が済ませている
      setTags([result.tag]);
      setName("");
      setPicking(false);
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
      const result = await unassignTag(memo.id, tagId);
      if (!result.ok) {
        setError("外せませんでした。もう一度お試しください");
        return;
      }
      setTags([]);
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
      const result = await removeMemo(memo.id);
      if (!result.ok) {
        // 消えていないのでシートは閉じない。押し直せる状態のまま残す
        // （change 7 D5）。閉じてから結果が分かる形だと、どこで失敗した
        // のかが分からなくなる。
        setError("消せませんでした。もう一度お試しください");
        return;
      }
      onDeleted();
    } catch {
      /*
       * **action を呼ぶ側の try/catch は残す。** action の中の失敗は
       * 戻り値になるが（design.md D4）、そこへ辿り着けない失敗は別にある——
       * 圏外、そして配備で action の識別子が変わったあとに古いビルドから
       * 呼んだ場合（design.md R2b）。どちらも throw で届く。
       */
      setError("消せませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
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
        {/*
         * 消すは上の帯（design.md D3）。取り消せない操作なので `--danger` を
         * 当て、他と見分けられるようにする。下の `.detail-foot` は子が1つで
         * gap が働いておらず、change 7 の残骸だったので落とした。
         */}
        <div className="head-right">
          {/*
           * 鉛筆はこのメモ全体を指す（change 14 D2）。復習の見出しの隣に
           * 置いていたが、本文まで直せるようになると指す範囲が広がるので
           * 上の帯へ移した。**画面に鉛筆は1つだけ。**
           */}
          <button
            type="button"
            className="pencil"
            aria-label="このメモを書き直す"
            /*
             * 答えが無いのに書き直しを開かせない。**以前はこれが「まだ
             * 取得できていない」の意味だった**が、いまはサーバーが最初の
             * 描画で渡してくる（design.md D7）ので、ここが真になるのは
             * 問答とスケジュールが食い違っている場合だけである。
             * 空欄で開くと、押した瞬間に答えを消してしまう。
             */
            disabled={busy || (review.kind === "scheduled" && answer === null)}
            onClick={() => {
              setWritingMode("rewrite");
              setWriting(true);
            }}
          >
            <span>
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M13.7 3.4a1.4 1.4 0 0 1 2 0l.9.9a1.4 1.4 0 0 1 0 2L7.2 15.7l-3.6.7.7-3.6z" />
                <path d="M12.4 4.7l2.9 2.9" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className="head-del"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            消す
          </button>
        </div>
      </div>

      <p className="detail-memo">{content}</p>

      {/*
       * 問・答・次回の出題日（design.md D2）。札を作らず、タグと同じ骨格の
       * まま並べる。**2版を問と答に1つずつ割り当て**、日付には版を当てない
       * ことで、書き直しが触らないものが形の上で分かれる。
       *
       * 答えは示す（design.md D1）。隠しても、上のメモ本文から読み取れる。
       */}
      <div className="field">
        <p className="field-label">復習</p>
        {review.kind === "scheduled" ? (
          <>
            <p className="qa-line">
              <b>問</b>
              {review.question}
            </p>
            {answer !== null && (
              <p className="qa-line ans">
                <b>答</b>
                {answer}
              </p>
            )}
            <p className="muted">次は {formatDay(review.nextReviewAt)}</p>
          </>
        ) : review.kind === "generating" ? (
          <p className="making">問と答をつくっています</p>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: "0.5rem" }}>
              まだ問と答がありません
            </p>
            <button
              type="button"
              className="write-link"
              onClick={() => {
                setWritingMode("create");
                setWriting(true);
              }}
            >
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

      {/*
       * 確認はシートで出す（design.md D4）。要点は見た目ではなく位置で、
       * **起動した「消す」と実行の「消す」が同じ場所に出ない**こと。
       * 同じ位置だと、続けて二度触れただけで消える（spec の要件）。
       */}
      {confirming && (
        <Sheet
          label="メモを消す"
          onClose={() => {
            // 閉じることは取り消しにあたる（memo-capture の要件）
            setConfirming(false);
            setError(null);
          }}
        >
          <p className="sheet-label">このメモを消しますか</p>
          <p className="sheet-memo">{content}</p>
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
        </Sheet>
      )}

      {/*
       * 同じシートを作成と書き直しの両方に使う（design.md D6）。**いまの
       * 問と答を渡す**ので、書き直しは空欄から始まらない。渡さなければ
       * 作成として開く。
       */}
      {writing && (
        <QuizSheet
          memoId={memo.id}
          memoContent={content}
          mode={writingMode}
          initial={
            review.kind === "scheduled" && answer !== null
              ? { question: review.question, answer }
              : undefined
          }
          onDone={(created) => {
            setWriting(false);
            setContent(created.content);
            // 問答を持たないメモの書き直しでは、復習の状態はそのまま
            if (created.nextReviewAt > 0) {
              setReview({
                kind: "scheduled",
                question: created.question,
                nextReviewAt: created.nextReviewAt,
              });
              setAnswer(created.answer);
            }
          }}
          onLater={() => setWriting(false)}
        />
      )}
    </div>
  );
}
