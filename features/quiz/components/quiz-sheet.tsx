"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { rewriteMemoContent } from "@/features/memo/actions";
import type { RewriteContentReason } from "@/features/memo/types";
import { Sheet } from "@/features/sheet/sheet";
import { rewriteQuiz, writeQuiz } from "../actions";
import type { WriteQuizReason } from "../types";

/**
 * 失敗の理由を利用者の言葉にする。
 *
 * design.md D3: **総当たりの対応表にする。** `Record<string, string>` だった
 * ころは `FALLBACK` が要り、しかも `too_long_content` という**どの経路からも
 * 返らない鍵**が混じっていた（誰も気づけなかった）。理由が union になった
 * ので、余った鍵も足りない鍵も型検査で出る。
 */
const ERRORS: Record<WriteQuizReason | RewriteContentReason, string> = {
  empty: "本文を入力してください",
  empty_question: "問を入力してください",
  empty_answer: "答を入力してください",
  too_long: "長すぎます。ひとことで書いてください",
  memo_not_found: "メモが見つかりませんでした",
  not_found: "メモが見つかりませんでした",
  already_exists: "このメモにはすでに問と答があります",
  failed: "保存できませんでした。もう一度お試しください",
};

type Done = { content: string; question: string; answer: string; nextReviewAt: number };

type SheetState =
  | { status: "idle" }
  | { status: "done"; done: Done }
  | { status: "error"; reason: WriteQuizReason | RewriteContentReason };

const IDLE: SheetState = { status: "idle" };

/**
 * 問と答のシート。2つの経路から開く（design.md D6）。
 *
 * - **作成**: 生成に失敗して未作成のまま残ったメモを手で書く
 * - **書き直し**: 本文・問・答を利用者が直す（change 13・14）
 *
 * **画面を分けない。** 検証（空でない・長さの上限）も、失敗しても入力を
 * 残す挙動も、どの経路にも同じものが要る。分けると片方だけ直したときにずれる。
 *
 * 書き直しでは**本文も直せる**。本文を変えるとそこから作った答えが黙って
 * 古くなるので、直すべきものが同じ場面に並んでいる必要がある（change 14 D1）。
 */
export function QuizSheet({
  memoId,
  memoContent,
  mode,
  initial,
  onDone,
  onLater,
}: {
  memoId: string;
  /** いまの本文。書き直しでは初期値になる */
  memoContent: string;
  /**
   * 作るのか、直すのか。
   *
   * **`initial` の有無とは別に持つ。** 問と答をまだ持たないメモでも本文は
   * 直せるので、「直す」かつ「問答の欄なし」という組み合わせがある
   * （change 14 D3）。
   */
  mode: "create" | "rewrite";
  /**
   * いまの問と答。**書き直しのときは必ず渡す。**
   *
   * 空欄から始めると、直したいものを書き写させることになる
   * （spec「いまの内容から直す」）。
   */
  initial?: { question: string; answer: string };
  onDone: (created: {
    content: string;
    question: string;
    answer: string;
    nextReviewAt: number;
  }) => void;
  onLater: () => void;
}) {
  const rewriting = mode === "rewrite";
  const [content, setContent] = useState(memoContent);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  /** 問と答の欄を出すか。作成のときと、既に持っているときだけ */
  const withQuiz = mode === "create" || initial !== undefined;
  /**
   * 保存は Server Action を 2 つ、順に呼ぶ。
   *
   * **生の action を `useActionState` に渡さない**（design.md D2）。ここは
   * 2 つの action を順序づけて呼ぶ必要があり、また通信の失敗が
   * error boundary へ飛ぶと入力中の問と答が消える。どちらの理由でも、
   * クライアント側の関数で包む。
   */
  const [state, formAction, saving] = useActionState(async (): Promise<SheetState> => {
    try {
      /*
       * **本文を先に書く**（change 14 D4）。2つの表にまたがるので、まとめて
       * 書く手段が無い。途中で落ちたとき、本文だけ新しくなるほうが気づける
       * ―― 逆順だと本文が古いまま答えが新しくなり、食い違いに気づけない。
       *
       * 変更が無い側は書かない。触っていない問答へ要求を投げない。
       */
      if (rewriting && content.trim() !== memoContent) {
        const written = await rewriteMemoContent(memoId, content);
        if (!written.ok) return { status: "error", reason: written.reason };
      }

      if (!withQuiz) {
        // 問答を持たないメモ。本文だけ直して終わり（change 14 D3）
        return {
          status: "done",
          done: { content: content.trim(), question, answer, nextReviewAt: 0 },
        };
      }

      // 書き直しは置き換え、作成は新規。保存先を分ける
      const result = rewriting
        ? await rewriteQuiz(memoId, question, answer)
        : await writeQuiz(memoId, question, answer);
      // 失敗しても入力は消さない。そのまま押し直せる
      if (!result.ok) return { status: "error", reason: result.reason };

      return {
        status: "done",
        done: {
          content: content.trim(),
          question: result.question,
          answer: result.answer,
          nextReviewAt: result.nextReviewAt,
        },
      };
    } catch {
      return { status: "error", reason: "failed" };
    }
  }, IDLE);

  /** 打鍵したら、前の失敗の表示を引っ込める（memo-tab と同じ形） */
  const [dismissed, setDismissed] = useState<SheetState | null>(null);
  const error = state.status === "error" && state !== dismissed ? ERRORS[state.reason] : null;
  const clearError = () => {
    if (state.status === "error") setDismissed(state);
  };

  /** 保存できたら親へ返す。同じ結果で 2 度走らせない */
  const handled = useRef<SheetState | null>(null);
  useEffect(() => {
    if (state.status !== "done" || handled.current === state) return;
    handled.current = state;
    onDone(state.done);
  }, [state, onDone]);

  const ready =
    content.trim().length > 0 &&
    (!withQuiz || (question.trim().length > 0 && answer.trim().length > 0));

  return (
    <Sheet label={rewriting ? "問と答の書き直し" : "問と答の作成"} onClose={onLater}>
      <form action={formAction}>
        <p className="sheet-label">{rewriting ? "このメモを直す" : "書きとめた"}</p>

        {/* 書き直しでは本文も直せる（change 14 D1）。作成では読むだけ */}
        {rewriting ? (
          <div className="field">
            <label htmlFor="c">本文</label>
            <textarea
              id="c"
              rows={3}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                clearError();
              }}
              autoFocus
            />
          </div>
        ) : (
          <p className="sheet-memo">{memoContent}</p>
        )}

        {!rewriting && (
          <p className="muted" style={{ marginBottom: "1rem" }}>
            問いのかたちにしておく？
          </p>
        )}

        {withQuiz && (
          <div className="field">
            <label htmlFor="q">問</label>
            <input
              id="q"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                clearError();
              }}
              placeholder="なにを思い出したい？"
              autoFocus={!rewriting}
            />
          </div>
        )}

        {withQuiz && (
          <div className="field">
            <label htmlFor="a">答</label>
            <input
              id="a"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                clearError();
              }}
              placeholder="ひとことで"
            />
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-foot">
          <button type="submit" className="btn btn-orange" disabled={saving || !ready}>
            {saving ? "保存中..." : rewriting ? "直す" : "これでいい"}
          </button>
          <button type="button" className="later" onClick={onLater}>
            {rewriting ? "やめる" : "あとで"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
