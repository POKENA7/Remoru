"use client";

import { useCallback, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { QuizSheet } from "./quiz-sheet";
import { MAX_CONTENT_LENGTH, formatDay, type MemoRow } from "./types";

const ERRORS: Record<string, string> = {
  empty: "本文を入力してください",
  too_long: `${MAX_CONTENT_LENGTH}文字を超えています`,
  invalid_body: "保存できませんでした。入力内容を確認してください",
  invalid_json: "保存できませんでした。入力内容を確認してください",
};
const FALLBACK = "保存できませんでした。もう一度お試しください";

type Sheet = { memoId: string; content: string } | null;

export function MemoTab({
  memos,
  loading,
  onChanged,
  onOpenDetail,
  tags,
  activeTagId,
  onSelectTag,
  suggestion,
}: {
  memos: MemoRow[];
  loading: boolean;
  onChanged: () => void;
  onOpenDetail: (memo: MemoRow) => void;
  tags: { id: string; name: string; count: number }[];
  activeTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
  /** タグの提案の帯。出す条件は app-shell が決める */
  suggestion: React.ReactNode;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  /**
   * 問と答を作り直す。
   *
   * 失敗しても以前の問答は残る（サーバー側で保証している）ので、
   * 画面には何も出さない。責めない語り口と一貫させる。
   */
  const regenerate = useCallback(
    async (memoId: string) => {
      if (regenerating) return;
      setRegenerating(memoId);
      try {
        await fetch(`/api/memos/${memoId}/quiz-item`, { method: "PUT" });
      } catch {
        // 以前の問答がそのまま残る
      } finally {
        setRegenerating(null);
        onChanged();
      }
    },
    [regenerating, onChanged],
  );

  const save = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (saving) return;
      setSaving(true);
      setError(null);

      try {
        const res = await fetch("/api/memos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = (await res.json()) as {
          memo?: MemoRow;
          error?: string;
        };
        if (!res.ok || !data.memo) {
          setError(ERRORS[data.error ?? ""] ?? FALLBACK);
          return;
        }
        setContent("");
        onChanged();
        // 保存直後にシートをせり上げない。問と答は生成が作る。ここで手入力を
        // 求めると、書いたものが遅れて届く生成結果と競合する。手で書く経路は
        // 一覧の「問と答をつくる →」に残っている（生成に失敗したメモに出る）。
      } catch {
        setError(FALLBACK);
      } finally {
        setSaving(false);
      }
    },
    [content, saving, onChanged],
  );


  const chars = [...content].length;
  const over = chars > MAX_CONTENT_LENGTH;

  return (
    <>
      <div className="brand-row">
        <h1 className="brand">Remoru</h1>
        <UserButton />
      </div>

      <form className="composer" onSubmit={save}>
        <textarea
          className="input"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError(null);
          }}
          placeholder="いま、覚えておきたいこと"
          rows={2}
          aria-label="メモの本文"
        />
        <div className="composer-foot">
          <span className={over ? "hint over" : "hint"}>
            {chars === 0 ? "ひとことでいい" : `${chars} / ${MAX_CONTENT_LENGTH}`}
          </span>
          <button
            type="submit"
            className="btn btn-orange"
            disabled={saving || over || chars === 0}
          >
            {saving ? "保存中..." : "書きとめる"}
          </button>
        </div>
        {over && (
          <p className="error" role="alert">
            {ERRORS.too_long}
          </p>
        )}
        {!over && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      {suggestion}

      <p className="section-head">
        書きとめたもの <span>新しい順</span>
      </p>

      {tags.length > 0 && (
        <div className="filter-band" role="group" aria-label="タグで絞り込む">
          <button
            type="button"
            className={activeTagId === null ? "chip chip-on" : "chip"}
            aria-pressed={activeTagId === null}
            onClick={() => onSelectTag(null)}
          >
            ぜんぶ
          </button>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={activeTagId === t.id ? "chip chip-on" : "chip"}
              aria-pressed={activeTagId === t.id}
              onClick={() => onSelectTag(t.id)}
            >
              {t.name} <i>{t.count}</i>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">読み込み中...</p>
      ) : memos.length === 0 ? (
        activeTagId !== null ? (
          <div className="empty">
            <strong>このタグのメモはありません</strong>
            <p className="muted">上の「ぜんぶ」に戻すと、すべて表示されます。</p>
          </div>
        ) : (
          <div className="empty">
            <strong>まだ何もありません</strong>
            <p className="muted">上の欄に、覚えておきたいことを書いてみてください。</p>
          </div>
        )
      ) : (
        <ul className="memo-list">
          {memos.map((memo) => (
            <li
              key={memo.id}
              className={memo.review.kind === "unwritten" ? "memo unwritten" : "memo"}
            >
              <p className="memo-text">{memo.content}</p>

              {/* タグ。持たないメモは持たないと分かる形にする */}
              <p className="tag-row">
                {memo.tags.length > 0 ? (
                  memo.tags.map((t) => (
                    <span key={t.id} className="tag">
                      {t.name}
                    </span>
                  ))
                ) : (
                  <span className="tag tag-none">タグなし</span>
                )}
              </p>

              {/* 問だけを出す。答えは出さない（想起の機会を壊さない） */}
              {memo.review.kind === "scheduled" && memo.review.question && (
                <p className="memo-q">問：{memo.review.question}</p>
              )}

              <div className="memo-foot">
                {memo.review.kind === "scheduled" ? (
                  <span className="due">
                    次は {formatDay(memo.review.nextReviewAt)}
                  </span>
                ) : memo.review.kind === "generating" ? (
                  <span className="making">問と答をつくっています</span>
                ) : (
                  <button
                    type="button"
                    className="write-link"
                    onClick={() => setSheet({ memoId: memo.id, content: memo.content })}
                  >
                    問と答をつくる →
                  </button>
                )}
                {memo.review.kind === "scheduled" && (
                  <button
                    type="button"
                    className="redo"
                    onClick={() => void regenerate(memo.id)}
                    disabled={regenerating === memo.id}
                  >
                    {regenerating === memo.id ? "つくり直しています..." : "つくり直す"}
                  </button>
                )}
                {/* 削除はここに置かない。詳細へ移した（design.md D4） */}
                <button
                  type="button"
                  className="redo detail-link"
                  onClick={() => onOpenDetail(memo)}
                >
                  くわしく
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheet && (
        <QuizSheet
          memoId={sheet.memoId}
          memoContent={sheet.content}
          onDone={() => {
            setSheet(null);
            onChanged();
          }}
          onLater={() => setSheet(null)}
        />
      )}
    </>
  );
}
