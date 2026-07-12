"use client";

import { useEffect, useState } from "react";

type DueCard = {
  cardId: string;
  question: string;
  answer: string;
  dueDate: number;
};

export default function ReviewPage() {
  const [queue, setQueue] = useState<DueCard[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/review/due")
      .then((r) => r.json() as Promise<DueCard[]>)
      .then((cards) => {
        setQueue(cards);
        setLoading(false);
      });
  }, []);

  async function rate(rating: "again" | "hard" | "good" | "easy") {
    const card = queue[index];
    await fetch(`/api/review/${card.cardId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    setShowAnswer(false);
    setIndex((i) => i + 1);
  }

  if (loading) return <p>読み込み中...</p>;
  if (index >= queue.length) return <p>今日の復習は完了しました！</p>;

  const card = queue[index];

  return (
    <main>
      <p>
        {index + 1} / {queue.length}
      </p>
      <h2>{card.question}</h2>
      {showAnswer ? (
        <>
          <p>{card.answer}</p>
          <button onClick={() => rate("again")}>もう一度</button>
          <button onClick={() => rate("hard")}>難しい</button>
          <button onClick={() => rate("good")}>普通</button>
          <button onClick={() => rate("easy")}>簡単</button>
        </>
      ) : (
        <button onClick={() => setShowAnswer(true)}>答えを見る</button>
      )}
    </main>
  );
}
