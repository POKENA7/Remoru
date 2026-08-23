"use client";

import { useCallback, useEffect, useState } from "react";

const MAX_CONTENT_LENGTH = 1000;

type Memo = {
  id: string;
  userId: string;
  content: string;
  createdAt: number;
};

const ERROR_MESSAGES: Record<string, string> = {
  empty: "本文を入力してください",
  too_long: `${MAX_CONTENT_LENGTH}文字を超えています`,
  invalid_body: "保存できませんでした。入力内容を確認してください",
  invalid_json: "保存できませんでした。入力内容を確認してください",
};

const FALLBACK_ERROR = "保存できませんでした。もう一度お試しください";

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [content, setContent] = useState("");
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/memos");
        if (!res.ok) throw new Error(`GET /api/memos -> ${res.status}`);
        const data = (await res.json()) as { memos: Memo[] };
        if (!cancelled) setMemos(data.memos);
      } catch {
        if (!cancelled) setError("メモを読み込めませんでした");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (saving) return;

      setSaving(true);
      setError(null);

      try {
        const res = await fetch("/api/memos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        const data = (await res.json()) as
          | { memo: Memo }
          | { error: string };

        if (!res.ok || !("memo" in data)) {
          const code = "error" in data ? data.error : "";
          // 失敗しても入力欄は消さない。利用者はそのまま再実行できる。
          setError(ERROR_MESSAGES[code] ?? FALLBACK_ERROR);
          return;
        }

        // 画面遷移も再読み込みもせず、その場で一覧の先頭に反映する
        setMemos((current) => [data.memo, ...current]);
        setContent("");
      } catch {
        setError(FALLBACK_ERROR);
      } finally {
        setSaving(false);
      }
    },
    [content, saving],
  );

  const charCount = [...content].length;
  const overLimit = charCount > MAX_CONTENT_LENGTH;

  return (
    <main className="page">
      <h1 className="title">Remoru</h1>

      <form onSubmit={handleSubmit} className="composer">
        <textarea
          className="input"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            // 入力が変われば前のエラーはもう現状を説明していない
            if (error) setError(null);
          }}
          placeholder="覚えておきたいこと、なんでも"
          rows={3}
          aria-label="メモの本文"
          autoFocus
        />

        <div className="composer-footer">
          <span className={overLimit ? "count over" : "count"}>
            {charCount} / {MAX_CONTENT_LENGTH}
          </span>
          <button
            type="submit"
            className="save"
            disabled={saving || overLimit || charCount === 0}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>

        {overLimit && (
          <p className="error" role="alert">
            {ERROR_MESSAGES.too_long}
          </p>
        )}

        {!overLimit && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      <section aria-label="保存済みのメモ">
        {loading ? (
          <p className="muted">読み込み中...</p>
        ) : memos.length === 0 ? (
          <div className="empty">
            <p className="empty-title">まだメモがありません</p>
            <p className="muted">
              上の入力欄に、覚えておきたいことを書いてみてください。
            </p>
          </div>
        ) : (
          <ul className="memo-list">
            {memos.map((memo, index) => (
              <li
                key={memo.id}
                className="memo"
                style={
                  {
                    "--card-accent": `var(--c${index % 5})`,
                  } as React.CSSProperties
                }
              >
                <p className="memo-content">{memo.content}</p>
                <time className="memo-time" dateTime={new Date(memo.createdAt).toISOString()}>
                  {formatTimestamp(memo.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
