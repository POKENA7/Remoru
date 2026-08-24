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
 * 問と答の作成シート。一覧の「問と答をつくる →」から開く。
 *
 * change 5 で**保存直後にはせり上がらなくなった**。問と答は生成が作り、
 * ここは生成に失敗して未作成のまま残ったメモを手で書くための経路。
 */
export function QuizSheet({
  memoId,
  memoContent,
  onDone,
  onLater,
}: {
  memoId: string;
  memoContent: string;
  onDone: () => void;
  onLater: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/memos/${memoId}/quiz-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        // 失敗しても入力は消さない。そのまま押し直せる
        setError(ERRORS[data.error ?? ""] ?? FALLBACK);
        return;
      }
      onDone();
    } catch {
      setError(FALLBACK);
    } finally {
      setSaving(false);
    }
  }

  const ready = question.trim().length > 0 && answer.trim().length > 0;

  return (
    <div className="sheet-backdrop" role="dialog" aria-label="問と答の作成">
      <form className="sheet" onSubmit={submit}>
        <div className="grip" />
        <p className="sheet-label">書きとめた</p>
        <p className="sheet-memo">{memoContent}</p>

        <p className="muted" style={{ marginBottom: "1rem" }}>
          あとで思い出せるように、
          <br />
          問いのかたちにしておく？
        </p>

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
            {saving ? "保存中..." : "これでいい"}
          </button>
          <button type="button" className="later" onClick={onLater}>
            あとで
          </button>
        </div>
      </form>
    </div>
  );
}
