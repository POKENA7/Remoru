"use client";

import { useState } from "react";

const ERRORS: Record<string, string> = {
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
 * - **書き直し**: 生成が外したとき、利用者が自分の言葉で直す（change 13）
 *
 * **画面を分けない。** 検証（空でない・長さの上限）も、失敗しても入力を
 * 残す挙動も、両方に同じものが要る。分けると片方だけ直したときにずれる。
 */
export function QuizSheet({
  memoId,
  memoContent,
  initial,
  onDone,
  onLater,
}: {
  memoId: string;
  memoContent: string;
  /**
   * いまの問と答。**書き直しのときは必ず渡す。**
   *
   * 空欄から始めると、直したいものを書き写させることになる
   * （spec「いまの内容から直す」）。
   */
  initial?: { question: string; answer: string };
  onDone: (created: { question: string; answer: string; nextReviewAt: number }) => void;
  onLater: () => void;
}) {
  const rewriting = initial !== undefined;
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
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

  const ready = question.trim().length > 0 && answer.trim().length > 0;

  return (
    <div className="sheet-backdrop" role="dialog" aria-label={rewriting ? "問と答の書き直し" : "問と答の作成"}>
      <form className="sheet" onSubmit={submit}>
        <div className="grip" />
        <p className="sheet-label">書きとめた</p>
        <p className="sheet-memo">{memoContent}</p>

        {!rewriting && (
          <p className="muted" style={{ marginBottom: "1rem" }}>
            問いのかたちにしておく？
          </p>
        )}

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
            autoFocus
          />
        </div>

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

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-foot">
          <button
            type="submit"
            className="btn btn-orange"
            disabled={saving || !ready}
          >
            {saving ? "保存中..." : rewriting ? "直す" : "これでいい"}
          </button>
          <button type="button" className="later" onClick={onLater}>
            {rewriting ? "やめる" : "あとで"}
          </button>
        </div>
      </form>
    </div>
  );
}
