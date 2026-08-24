"use client";

import { useState } from "react";

type Summary = { tag: string; count: number };
type Assignment = { memoId: string; tag: string };

/**
 * タグの提案の帯。
 *
 * 未分類がたまったときだけ一覧の上に出る。**承認はタグ名と件数だけ**で
 * 行い、どのメモに何が付くかは見せない（design.md 制約3）。1件ずつ
 * 確かめさせると、手で付けるのと変わらない手間になる。
 */
export function TagSuggestionBand({
  untaggedCount,
  onApplied,
  onDismissed,
}: {
  untaggedCount: number;
  onApplied: () => void;
  onDismissed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tags/suggestion", { method: "POST" });
      if (!res.ok) {
        // 失敗は静かに。帯は残り、あとでやり直せる（design.md D11）
        setError("いまはうまくいきませんでした。あとでまた試せます");
        return;
      }
      const data = (await res.json()) as { summary: Summary[]; assignments: Assignment[] };
      setSummary(data.summary);
      setAssignments(data.assignments);
    } catch {
      setError("いまはうまくいきませんでした。あとでまた試せます");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tags/suggestion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      // **失敗したら提案を捨てない。** 捨てると、やり直すのにもう一度
      // モデルを呼ぶ（＝もう一度課金する）ことになる。
      if (!res.ok) {
        setError("いまはつけられませんでした。もう一度押せます");
        return;
      }
      const result = (await res.json()) as { applied: number; skipped: number };
      if (result.applied === 0) {
        setError("いまはつけられませんでした。もう一度押せます");
        return;
      }
      setSummary(null);
      onApplied();
    } catch {
      setError("いまはつけられませんでした。もう一度押せます");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/tags/suggestion", { method: "DELETE" });
      onDismissed();
    } catch {
      // 断れなくても害は無い。帯が残るだけ。
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div className="suggest-band" role="status">
        <p className="suggest-head">こう分けてみました</p>
        <div className="tag-choices">
          {summary.map((s) => (
            <span key={s.tag} className="tag">
              {s.tag} <i>{s.count}</i>
            </span>
          ))}
        </div>
        <p className="hint" style={{ margin: "0.6rem 0 0.8rem" }}>
          あとから1件ずつ変えられます
        </p>
        {error && <p className="error">{error}</p>}
        <div className="suggest-foot">
          <button
            type="button"
            className="btn btn-orange"
            disabled={busy}
            onClick={() => void accept()}
          >
            {busy ? "つけています..." : "これでいい"}
          </button>
          <button
            type="button"
            className="later"
            disabled={busy}
            onClick={() => setSummary(null)}
          >
            やめておく
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="suggest-band">
      <p className="suggest-head">タグのないメモが{untaggedCount}件</p>
      {error ? (
        <p className="hint" style={{ marginBottom: "0.7rem" }}>
          {error}
        </p>
      ) : (
        <p className="hint" style={{ marginBottom: "0.7rem" }}>
          まとめて分けてみることもできます
        </p>
      )}
      <div className="suggest-foot">
        <button
          type="button"
          className="btn btn-blue"
          disabled={busy}
          onClick={() => void propose()}
        >
          {busy ? "考えています..." : "まとめて分ける"}
        </button>
        <button type="button" className="later" disabled={busy} onClick={() => void dismiss()}>
          いまはいい
        </button>
      </div>
    </div>
  );
}
