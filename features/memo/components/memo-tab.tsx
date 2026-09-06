"use client";

import { UserButton } from "@clerk/nextjs";
import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveMemo } from "../actions";
import { stateLabel } from "../detail-selection";
import { type FreshMemo, takeFresh } from "../fresh-memo";
import { MAX_CONTENT_LENGTH } from "../memos";
import type { MemoRow, SaveMemoReason, SaveMemoState } from "../types";

/**
 * 失敗の理由を利用者の言葉にする。
 *
 * design.md D3: **総当たりの対応表にする。** `Record<string, string>` だった
 * ころは、無い鍵を引いたときのために `FALLBACK` が要り、理由が増えても
 * 気づけなかった。理由がリテラルの union になったので、足りなければ型検査で出る。
 */
const ERRORS: Record<SaveMemoReason, string> = {
  empty: "本文を入力してください",
  too_long: `${MAX_CONTENT_LENGTH}文字を超えています`,
  failed: "保存できませんでした。もう一度お試しください",
};

const IDLE: SaveMemoState = { status: "idle" };

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
  onOpenDetail,
  draft,
  onDraftChange,
  fresh,
  onSaved,
  onPrinted,
  tags,
  activeTagId,
  onSelectTag,
  suggestion,
  announcement,
}: {
  memos: MemoRow[];
  loading: boolean;
  onOpenDetail: (memo: MemoRow) => void;
  /** 書きかけの本文。詳細を開くとこの画面は unmount されるので、外で持つ */
  draft: string;
  onDraftChange: (value: string) => void;
  /** いま書いた1件の id。刷りの合図。**この画面では持てない**（design.md D2） */
  fresh: FreshMemo;
  onSaved: (memoId: string) => void;
  /** 刷り終えた。憶えを外す */
  onPrinted: () => void;
  tags: { id: string; name: string; count: number }[];
  activeTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
  /** タグの提案の帯。出す条件は app-shell が決める */
  suggestion: React.ReactNode;
  /** 初回の告知。付けるメモと、その中身。無ければ null */
  announcement: { memoId: string; node: React.ReactNode } | null;
}) {
  const content = draft;

  /**
   * 保存は Server Action。`<form action={...}>` に渡す。
   *
   * **失敗しても入力は残る。** `<form>` の値はこちらが持ったままで、
   * action は状態を返すだけだからである（spec `memo-capture`
   * 「保存に失敗しても入力内容が残る」）。
   */
  const [state, formAction, saving] = useActionState(
    async (prev: SaveMemoState, form: FormData) => {
      try {
        return await saveMemo(prev, form);
      } catch {
        /*
         * **action に辿り着けない失敗を、ここで戻り値に変える**（design.md D2）。
         *
         * `useActionState` に生の action を渡すと、通信の失敗（圏外、配備で
         * 識別子が変わったあとの呼び出し）は error boundary へ飛び、入力中の
         * 本文ごと画面が差し替わる。spec `memo-capture`「保存に失敗しても
         * 入力内容が残る」を満たせない。
         *
         * 包むと JavaScript 未読込での submit は効かなくなるが、それは
         * 約束していない（design.md Non-Goals）。
         */
        return { status: "error", reason: "failed" } as SaveMemoState;
      }
    },
    IDLE,
  );

  /**
   * 一度出したエラーを、次の打鍵で引っ込める。
   *
   * action の状態は外から消せないので、「どの結果を見送ったか」を持つ。
   * action は呼ばれるたびに新しいオブジェクトを返すので、同じ理由で
   * 2 度失敗しても同一視されない。
   */
  const [dismissed, setDismissed] = useState<SaveMemoState | null>(null);
  const error = state.status === "error" && state !== dismissed ? ERRORS[state.reason] : null;

  /**
   * 保存できたら下書きを消し、刷りの合図を立てる。
   *
   * どちらも親が持つ状態なので、描画の中では触れない。同じ結果で 2 度
   * 走らないよう、処理済みの状態を控える。
   */
  const handled = useRef<SaveMemoState | null>(null);
  useEffect(() => {
    if (state.status !== "saved" || handled.current === state) return;
    handled.current = state;
    onDraftChange("");
    onSaved(state.memoId);
    // 一覧の取り直しは action の中の `refresh()` が済ませている
  }, [state, onDraftChange, onSaved]);

  /**
   * 刷りの動きを付ける（design.md D1）。
   *
   * **高さは動かす前に測る。** 本文は最大1000文字で、行の高さは中身で
   * 変わる。固定値を置くと長い本文が切れる。アニメーションを先に付けると
   * 0 を測ってしまうので、測る → 付ける の順に要る。
   */
  const printRef = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    const row = printRef.current;
    if (!row) return;
    row.style.setProperty("--print-h", `${row.getBoundingClientRect().height}px`);
    row.classList.add("printing");
    // 動きを止めた人には橙の版が残る。次のフレームで引きはじめる（D4）。
    // 動く人には効かない指定なので、分岐せずに常に付ける
    requestAnimationFrame(() => requestAnimationFrame(() => row.classList.add("printed")));
    // 刷ったら憶えを外す。残すと次の unmount でまた刷る（design.md D2）
    onPrinted();
    // **memos も要る。** 保存は `fresh` を先に立て、一覧はそのあとの取得で
    // 届く。`fresh` だけを見ていると、行が現れた回に走らず刷られない。
  }, [fresh, memos, onPrinted]);

  /**
   * 押した位置から波紋を出す（design.md D5）。ボタンの中心からではなく
   * **指の位置から**出すことで、押したのが自分だという手応えになる。
   * `click` を待つと押してから発火までに間が空くので `pointerdown` を使う。
   */
  const ripple = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const box = btn.getBoundingClientRect();
    const mark = document.createElement("span");
    mark.className = "ripple";
    mark.style.left = `${e.clientX - box.left}px`;
    mark.style.top = `${e.clientY - box.top}px`;
    btn.appendChild(mark);
    setTimeout(() => mark.remove(), 500);
  }, []);

  const chars = [...content].length;
  const over = chars > MAX_CONTENT_LENGTH;

  return (
    <>
      <div className="brand-row">
        <h1 className="brand">Remoru</h1>
        <UserButton />
      </div>

      <form className="composer" action={formAction}>
        <textarea
          className="input"
          name="content"
          value={content}
          onChange={(e) => {
            onDraftChange(e.target.value);
            if (state.status === "error") setDismissed(state);
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
            onPointerDown={ripple}
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
            <li
              key={memo.id}
              className="memo-item"
              ref={takeFresh(fresh, memo.id) ? printRef : undefined}
            >
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
