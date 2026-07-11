"use client";

import { useEffect, useState } from "react";

type Memo = {
  id: string;
  content: string;
  quizMode: "ai" | "manual";
  createdAt: number;
  quizItemId: string;
  quizStatus: "pending" | "ready" | "failed";
  question: string;
  answer: string;
};

export default function HomePage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [content, setContent] = useState("");
  const [quizMode, setQuizMode] = useState<"ai" | "manual">("ai");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [fixDrafts, setFixDrafts] = useState<
    Record<string, { question: string; answer: string }>
  >({});

  async function loadMemos() {
    const res = await fetch("/api/memos");
    if (res.ok) setMemos(await res.json());
  }

  useEffect(() => {
    loadMemos();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/memos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, quizMode, question, answer }),
    });
    setContent("");
    setQuestion("");
    setAnswer("");
    await loadMemos();
  }

  async function handleFixSubmit(quizItemId: string, e: React.FormEvent) {
    e.preventDefault();
    const draft = fixDrafts[quizItemId];
    if (!draft) return;
    await fetch(`/api/quiz-items/${quizItemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    await loadMemos();
  }

  return (
    <main>
      <h1>Remoru</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="メモ本文"
          required
        />
        <label>
          <input
            type="radio"
            checked={quizMode === "ai"}
            onChange={() => setQuizMode("ai")}
          />
          AIで自動生成
        </label>
        <label>
          <input
            type="radio"
            checked={quizMode === "manual"}
            onChange={() => setQuizMode("manual")}
          />
          自分でQ&Aを入力
        </label>
        {quizMode === "manual" && (
          <>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="質問"
              required
            />
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="答え"
              required
            />
          </>
        )}
        <button type="submit">保存</button>
      </form>
      <ul>
        {memos.map((memo) => (
          <li key={memo.id}>
            {memo.content}
            {memo.quizStatus === "pending" && <span>(クイズ生成中...)</span>}
            {memo.quizStatus === "failed" && (
              <form onSubmit={(e) => handleFixSubmit(memo.quizItemId, e)}>
                <p>クイズの自動生成に失敗しました。手動で入力してください。</p>
                <input
                  placeholder="質問"
                  value={fixDrafts[memo.quizItemId]?.question ?? ""}
                  onChange={(e) =>
                    setFixDrafts((prev) => ({
                      ...prev,
                      [memo.quizItemId]: {
                        question: e.target.value,
                        answer: prev[memo.quizItemId]?.answer ?? "",
                      },
                    }))
                  }
                  required
                />
                <input
                  placeholder="答え"
                  value={fixDrafts[memo.quizItemId]?.answer ?? ""}
                  onChange={(e) =>
                    setFixDrafts((prev) => ({
                      ...prev,
                      [memo.quizItemId]: {
                        question: prev[memo.quizItemId]?.question ?? "",
                        answer: e.target.value,
                      },
                    }))
                  }
                  required
                />
                <button type="submit">保存</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
