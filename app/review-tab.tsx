"use client";

import { useState } from "react";
import { cellFills } from "./cells";
import type { DueItem } from "./types";

/** 進捗マス。規則は app/cells.ts。 */
function Cells({ total, done }: { total: number; done: number }) {
  const fills = cellFills(total, done);
  if (fills.length === 0) return null;

  return (
    <div className="cells" aria-label={`${total}枚中${done}枚`}>
      {fills.map((filled, i) => (
        <div key={i} className={filled > 0 && filled < 1 ? "cell current" : "cell"}>
          <i style={{ width: `${filled * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

type Phase = "before" | "running" | "done";

export function ReviewTab({
  items,
  loading,
  onFinished,
  onGoToMemos,
}: {
  items: DueItem[];
  loading: boolean;
  onFinished: () => void;
  onGoToMemos: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("before");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 完了時に「何枚やったか」。onFinished() が一覧を取り直すと items は
   * 0件になるので、その前に控えておく。items から読むと 0枚 と表示される。
   */
  const [finishedCount, setFinishedCount] = useState(0);

  const total = items.length;
  const item = items[index];

  async function grade(recalled: boolean) {
    if (!item || grading) return;
    setGrading(true);
    setError(null);

    try {
      const res = await fetch(`/api/review/${item.quizItemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recalled, occurrenceAt: item.occurrenceAt }),
      });
      if (!res.ok) {
        // 記録できていないので進めない。押し直せる状態のまま残す。
        setError("記録できませんでした。もう一度押してください");
        return;
      }
      // 二重送信だった場合も記録済みなので、そのまま次へ進んでよい。
      if (index + 1 >= total) {
        setFinishedCount(total);
        setPhase("done");
        onFinished();
      } else {
        setIndex(index + 1);
        setRevealed(false);
      }
    } catch {
      setError("記録できませんでした。もう一度押してください");
    } finally {
      setGrading(false);
    }
  }

  if (loading) return <p className="muted">読み込み中...</p>;

  // 7. 復習が0件のとき
  if (total === 0 && phase !== "done") {
    return (
      <div className="finish">
        <div className="stamp">
          <b />
          <i />
        </div>
        <h2>今日は、なし</h2>
        <p className="muted">出す番の問いがありません。</p>
        <p className="muted" style={{ marginBottom: "1.5rem" }}>
          また溜まったら、ここに出てきます。
        </p>
        <button type="button" className="btn btn-plain" onClick={onGoToMemos}>
          なにか書きとめる
        </button>
      </div>
    );
  }

  // 6. 復習完了
  if (phase === "done") {
    return (
      <div className="finish">
        <div className="stamp">
          <b />
          <i />
        </div>
        <h2>おしまい</h2>
        <p className="muted">{finishedCount}枚、目を通しました。</p>
        <p className="muted" style={{ marginBottom: "1.25rem" }}>
          つづきはまた、そのうち。
        </p>
        <Cells total={finishedCount} done={finishedCount} />
        <button type="button" className="btn btn-plain" onClick={onGoToMemos}>
          メモに戻る
        </button>
      </div>
    );
  }

  // 3. 今日の復習・開始前
  if (phase === "before") {
    return (
      <div>
        <div className="stamp">
          <b />
          <i />
        </div>
        <h2 style={{ fontSize: "1.9rem", margin: "0 0 0.75rem", lineHeight: 1.3 }}>
          今日は
          <br />
          {total}枚
        </h2>
        <p className="muted">ぜんぶで1分くらい。</p>
        <p className="muted" style={{ marginBottom: "1.4rem" }}>
          途中でやめても、また出てきます。
        </p>

        <Cells total={total} done={0} />
        <p className="hint" style={{ marginBottom: "1.2rem" }}>
          1枚見るたび、ひとマス刷られます
        </p>

        <button
          type="button"
          className="btn btn-orange btn-wide"
          onClick={() => setPhase("running")}
        >
          はじめる
        </button>
        <p className="muted" style={{ textAlign: "center", marginTop: "0.7rem" }}>
          気が向いたときで
        </p>
      </div>
    );
  }

  // 4 / 5. 出題
  return (
    <div>
      <div className="review-head">
        <button
          type="button"
          className="quit"
          onClick={() => {
            setPhase("before");
            setIndex(0);
            setRevealed(false);
            setError(null);
            onFinished();
          }}
        >
          やめる
        </button>
        <span className="counter">{index + 1}枚目</span>
      </div>

      <Cells total={total} done={index} />

      <div className="card">
        <p className="q-label">問</p>
        <p className="q-text">{item.question}</p>

        {revealed && (
          <>
            <p className="a-label">答</p>
            <p className="a-text">{item.answer}</p>
            <p className="origin">{item.memoContent}</p>
          </>
        )}

        {!revealed && (
          <div className="reveal">
            <button
              type="button"
              className="btn btn-blue btn-wide"
              onClick={() => setRevealed(true)}
            >
              答えを見る
            </button>
            <p className="muted" style={{ textAlign: "center", marginTop: "0.6rem" }}>
              思い出せなくても大丈夫
            </p>
          </div>
        )}
      </div>

      {revealed && (
        <>
          {/* 2版を1つずつ。どちらも塗りで、幅も枠も同じ。 */}
          <div className="grade">
            <button
              type="button"
              className="btn btn-blue"
              onClick={() => grade(false)}
              disabled={grading}
            >
              忘れてた
            </button>
            <button
              type="button"
              className="btn btn-orange"
              onClick={() => grade(true)}
              disabled={grading}
            >
              覚えてた
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
