"use client";

import { useState } from "react";
import { Sheet } from "@/features/sheet/sheet";

const ERRORS: Record<string, string> = {
  empty: "本文を入力してください",
  too_long_content: `本文が長すぎます`,
  empty_question: "問を入力してください",
  empty_answer: "答を入力してください",
  too_long: "長すぎます。ひとことで書いてください",
  memo_not_found: "メモが見つかりませんでした",
  already_exists: "このメモにはすでに問と答があります",
};
const FALLBACK = "保存できませんでした。もう一度お試しください";

/**
 * 問と答のシート。2つの経路から開く（design.md D6）。
 *
 * - **作成**: 生成に失敗して未作成のまま残ったメモを手で書く
 * - **書き直し**: 本文・問・答を利用者が直す（change 13・14）
 *
 * **画面を分けない。** 検証（空でない・長さの上限）も、失敗しても入力を
 * 残す挙動も、どの経路にも同じものが要る。分けると片方だけ直したときにずれる。
 *
 * 書き直しでは**本文も直せる**。本文を変えるとそこから作った答えが黙って
 * 古くなるので、直すべきものが同じ場面に並んでいる必要がある（change 14 D1）。
 */
export function QuizSheet({
  memoId,
  memoContent,
  mode,
  initial,
  onDone,
  onLater,
}: {
  memoId: string;
  /** いまの本文。書き直しでは初期値になる */
  memoContent: string;
  /**
   * 作るのか、直すのか。
   *
   * **`initial` の有無とは別に持つ。** 問と答をまだ持たないメモでも本文は
   * 直せるので、「直す」かつ「問答の欄なし」という組み合わせがある
   * （change 14 D3）。
   */
  mode: "create" | "rewrite";
  /**
   * いまの問と答。**書き直しのときは必ず渡す。**
   *
   * 空欄から始めると、直したいものを書き写させることになる
   * （spec「いまの内容から直す」）。
   */
  initial?: { question: string; answer: string };
  onDone: (created: {
    content: string;
    question: string;
    answer: string;
    nextReviewAt: number;
  }) => void;
  onLater: () => void;
}) {
  const rewriting = mode === "rewrite";
  const [content, setContent] = useState(memoContent);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  /** 問と答の欄を出すか。作成のときと、既に持っているときだけ */
  const withQuiz = mode === "create" || initial !== undefined;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      /*
       * **本文を先に書く**（change 14 D4）。2つの表にまたがるので、まとめて
       * 書く手段が無い。途中で落ちたとき、本文だけ新しくなるほうが気づける
       * ―― 逆順だと本文が古いまま答えが新しくなり、食い違いに気づけない。
       *
       * 変更が無い側は書かない。触っていない問答へ要求を投げない。
       */
      if (rewriting && content.trim() !== memoContent) {
        const res = await fetch(`/api/memos/${memoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(ERRORS[data.error ?? ""] ?? FALLBACK);
          return;
        }
      }

      if (!withQuiz) {
        // 問答を持たないメモ。本文だけ直して終わり（change 14 D3）
        onDone({ content: content.trim(), question, answer, nextReviewAt: 0 });
        return;
      }

      const res = await fetch(`/api/memos/${memoId}/quiz-item`, {
        // 書き直しは置き換え。作成と保存先を分ける
        method: rewriting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const data = (await res.json()) as {
        error?: string;
        quizItem?: { question: string; answer?: string };
        nextReviewAt?: number;
      };
      if (!res.ok) {
        // 失敗しても入力は消さない。そのまま押し直せる
        setError(ERRORS[data.error ?? ""] ?? FALLBACK);
        return;
      }
      onDone({
        content: content.trim(),
        question: data.quizItem?.question ?? question,
        answer: data.quizItem?.answer ?? answer,
        nextReviewAt: data.nextReviewAt ?? Date.now(),
      });
    } catch {
      setError(FALLBACK);
    } finally {
      setSaving(false);
    }
  }

  const ready =
    content.trim().length > 0 &&
    (!withQuiz || (question.trim().length > 0 && answer.trim().length > 0));

  return (
    <Sheet label={rewriting ? "問と答の書き直し" : "問と答の作成"} onClose={onLater}>
      <form onSubmit={submit}>
        <p className="sheet-label">{rewriting ? "このメモを直す" : "書きとめた"}</p>

        {/* 書き直しでは本文も直せる（change 14 D1）。作成では読むだけ */}
        {rewriting ? (
          <div className="field">
            <label htmlFor="c">本文</label>
            <textarea
              id="c"
              rows={3}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError(null);
              }}
              autoFocus
            />
          </div>
        ) : (
          <p className="sheet-memo">{memoContent}</p>
        )}

        {!rewriting && (
          <p className="muted" style={{ marginBottom: "1rem" }}>
            問いのかたちにしておく？
          </p>
        )}

        {withQuiz && (
          <div className="field">
            <label htmlFor="q">問</label>
            <input
              id="q"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                if (error) setError(null);
              }}
              placeholder="なにを思い出したい？"
              autoFocus={!rewriting}
            />
          </div>
        )}

        {withQuiz && (
          <div className="field">
            <label htmlFor="a">答</label>
            <input
              id="a"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (error) setError(null);
              }}
              placeholder="ひとことで"
            />
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-foot">
          <button type="submit" className="btn btn-orange" disabled={saving || !ready}>
            {saving ? "保存中..." : rewriting ? "直す" : "これでいい"}
          </button>
          <button type="button" className="later" onClick={onLater}>
            {rewriting ? "やめる" : "あとで"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
