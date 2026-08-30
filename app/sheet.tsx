"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canStartDrag, dragOffset, shouldClose } from "./sheet-drag";

/**
 * 下からせり上がる画面の外枠（design.md D1）。
 *
 * **閉じ方をここ1箇所に置く。** 2つのシートが別々に外枠を書いていたので、
 * 閉じ方を足すと片方だけ直したときに静かにずれていた。
 *
 * 出口は4つある ―― 外側・引く・ボタン・Escape。**引く操作だけにしない**
 * （`sheet` の要件）。引けない利用者がいて、掴み手は見落とされやすい。
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  /** 読み上げ用の名前 */
  label: string;
  /** 閉じる。**何も実行しない**（`sheet` の要件） */
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  /** 開く前に焦点があった場所。閉じたら戻す（design.md D6） */
  const opener = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    start: { y: number; at: number };
    previous: { y: number; at: number };
  } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => {
      // 控えた要素が消えていることがある（メモを消したあとなど）
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);

  // Escape で閉じる。スマホには無いので、外側と引く操作がその代わりになる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const fromGrip = target.closest(".grip") !== null;
    const sheet = sheetRef.current;
    if (!sheet) return;
    // 中身が一番上のときだけ引ける（design.md D3）
    if (!canStartDrag({ fromGrip, scrollTop: sheet.scrollTop })) return;
    // 入力欄の中では、カーソル移動と取り合わない
    if (!fromGrip && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

    const point = { y: e.clientY, at: e.timeStamp };
    drag.current = { start: point, previous: point };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const held = drag.current;
    if (!held) return;
    const point = { y: e.clientY, at: e.timeStamp };
    setOffset(dragOffset(held.start, point));
    drag.current = { start: held.start, previous: point };
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const held = drag.current;
      drag.current = null;
      if (!held) return;

      const close = shouldClose({
        start: held.start,
        previous: held.previous,
        end: { y: e.clientY, at: e.timeStamp },
        sheetHeight: sheetRef.current?.getBoundingClientRect().height ?? 0,
      });
      setOffset(0);
      if (close) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // 外側だけ。中身を押しても閉じない
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={offset > 0 ? "sheet dragging" : "sheet"}
        ref={sheetRef}
        style={offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setOffset(0);
        }}
      >
        <div className="grip" />
        {children}
      </div>
    </div>
  );
}
