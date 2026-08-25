"use client";

import { useCallback, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { stateLabel } from "./detail-selection";
import { MAX_CONTENT_LENGTH, type MemoRow } from "./types";

const ERRORS: Record<string, string> = {
  empty: "本文を入力してください",
  too_long: `${MAX_CONTENT_LENGTH}文字を超えています`,
  invalid_body: "保存できませんでした。入力内容を確認してください",
  invalid_json: "保存できませんでした。入力内容を確認してください",
};
const FALLBACK = "保存できませんでした。もう一度お試しください";

/**
 * 復習の状態を示す印（design.md D3）。
 *
 * **色の違いだけに頼らない。** 塗りつぶし・点滅・輪郭で形を変え、
 * 読み上げ用の名前も付ける。
 */
function StateMark({ kind }: { kind: MemoRow["review"]["kind"] }) {
  return <span className={`state state-${kind}`} role="img" aria-label={stateLabel(kind)} />;
}

export function MemoTab({
  memos,
  loading,
  onChanged,
  onOpenDetail,
  draft,
  onDraftChange,
  tags,
  activeTagId,
  onSelectTag,
  suggestion,
  announcement,
}: {
  memos: MemoRow[];
  loading: boolean;
  onChanged: () => void;
  onOpenDetail: (memo: MemoRow) => void;
  /** 書きかけの本文。詳細を開くとこの画面は unmount されるので、外で持つ */
  draft: string;
  onDraftChange: (value: string) => void;
  tags: { id: string; name: string; count: number }[];
  activeTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
  /** タグの提案の帯。出す条件は app-shell が決める */
  suggestion: React.ReactNode;
  /** 初回の告知。付けるメモと、その中身。無ければ null */
  announcement: { memoId: string; node: React.ReactNode } | null;
}) {
  const content = draft;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);


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
        onDraftChange("");
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
    [content, saving, onChanged, onDraftChange],
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
            onDraftChange(e.target.value);
            if (error) setError(null);
          }}
          placeholder="いま、覚えておきたいこと"
          rows={2}
          aria-label="メモの本文"
        />
        <div className="composer-foot">
          {/*
            * 何も書いていないときは何も出さない。以前は「ひとことでいい」を
            * 置いていたが、プレースホルダが同じことを言っている。
            */}
          <span className={over ? "hint over" : "hint"}>
            {chars === 0 ? "" : `${chars} / ${MAX_CONTENT_LENGTH}`}
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
          </div>
        ) : (
          <div className="empty">
            <strong>まだ何もありません</strong>
          </div>
        )
      ) : (
        <ul className="memo-list">
          {memos.map((memo) => (
            <li key={memo.id} className="memo-item">
              {/*
               * 行のどこを押しても詳細が開く（design.md D2）。押せる場所を
               * 指す小さな的（「くわしく」）は置かない。button の中には
               * 段落を入れられないので span で組む。
               */}
              <button
                type="button"
                data-memo-id={memo.id}
                className={
                  memo.review.kind === "unwritten" ? "memo memo-open unwritten" : "memo memo-open"
                }
                onClick={() => onOpenDetail(memo)}
              >
                <span className="memo-text">{memo.content}</span>

                <span className="memo-meta">
                  <span className="tag-row">
                    {memo.tags.length > 0 ? (
                      memo.tags.map((t) => (
                        <span key={t.id} className="tag">
                          {t.name}
                        </span>
                      ))
                    ) : (
                      <span className="tag tag-none">タグなし</span>
                    )}
                  </span>
                  <StateMark kind={memo.review.kind} />
                </span>
              </button>

              {announcement?.memoId === memo.id && announcement.node}
            </li>
          ))}
        </ul>
      )}

    </>
  );
}
