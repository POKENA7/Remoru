"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 経路をまたいでも残る状態。`sessionStorage` に置く。
 *
 * design.md D3 / D4: 下部タブが `<Link>` になった時点で、タブを移るたびに
 * 画面が unmount される。**書きかけの本文と、受け取ったタグの提案は
 * ここで黙って失われる。** どちらも「まだ確定していない、失うと痛いもの」で、
 * 過去に実際に踏んでいる（tests/architecture/unmount.arch.test.ts の冒頭を参照）。
 *
 * `localStorage` は使わない。端末に残り続ける寿命は、下書きには長すぎる。
 *
 * **最初の描画では既定値を返す。** サーバーには `sessionStorage` が無いので、
 * 読んだ値をいきなり返すと描画がずれる。読み込みは mount のあとに 1 回だけ行う。
 */
export function useSessionState<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // 読めない環境（プライベートウィンドウなど）では既定値のまま進む。
      // 保てないことより、画面が出ないことのほうが痛い
    }
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 書けなくても画面は動かす
      }
    },
    [key],
  );

  return [value, update];
}
