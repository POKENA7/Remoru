"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * 下部のタブ。
 *
 * design.md D1: 枠は Server Components のままにしたいので、
 * **いま選ばれているのはどれか**を知る必要があるこの部分だけを
 * クライアントに切り出す。行き先は `<Link>` なので、押した先の読み込みは
 * Next.js が先読みする。
 *
 * タブが 3 つである理由は docs/design-decisions.md「下部タブを3つにした理由」。
 */
export function TabBar({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();

  /**
   * 絞り込みを引き継ぐ（`memo-capture`「戻ったときに絞り込みの状態を保つ」）。
   *
   * PWA にはブラウザの戻るが無いので、**下部タブが戻り道になる**。素の `/` に
   * すると、一覧へ戻った瞬間に絞り込みが外れる（実機で発覚）。
   * 解くのは一覧の「ぜんぶ」の札の仕事で、タブの仕事ではない。
   *
   * **経路だけでは足りない。** `/review` と `/record` は絞り込みを持たないので、
   * 復習へ移って戻ると `?tag=` が消える（レビューの指摘）。いま見えている
   * 絞り込みを憶えておき、経路が持たない画面ではそれを使う。
   * 置き場は下書きと同じ `sessionStorage`——タブを閉じたら忘れてよい寿命。
   */
  const routeTag = useSearchParams().get("tag");
  const [rememberedTag, setRememberedTag] = useState<string | null>(null);

  const onMemoRoute = pathname === "/" || pathname.startsWith("/memos/");

  useEffect(() => {
    // 憶えるのはメモ側の経路にいるときだけ。復習や記録は絞り込みを持たないので、
    // そこで null を憶えると戻り先が素の一覧になる
    if (!onMemoRoute) return;
    try {
      if (routeTag) sessionStorage.setItem("remoru:tag", routeTag);
      else sessionStorage.removeItem("remoru:tag");
    } catch {
      // 書けない環境では引き継がないだけにする
    }
    setRememberedTag(routeTag);
  }, [onMemoRoute, routeTag]);

  useEffect(() => {
    if (rememberedTag !== null) return;
    try {
      setRememberedTag(sessionStorage.getItem("remoru:tag"));
    } catch {
      // 読めない環境では引き継がない
    }
  }, [rememberedTag]);

  const tag = onMemoRoute ? routeTag : rememberedTag;
  const memosHref = tag ? `/?tag=${encodeURIComponent(tag)}` : "/";

  const tabs = [
    { href: memosHref, label: "メモ" },
    { href: "/review", label: "復習" },
    { href: "/record", label: "記録" },
  ] as const;

  return (
    <nav className="tabs" role="tablist">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          role="tab"
          className="tab"
          // メモの詳細（/memos/…）を開いている間も「メモ」を選ばれた状態にする。
          // 詳細は一覧から入る画面で、別のタブではない
          aria-selected={
            tab.label === "メモ"
              ? pathname === "/" || pathname.startsWith("/memos/")
              : pathname === tab.href
          }
        >
          <i />
          {tab.label}
          {tab.label === "復習" && dueCount > 0 && <span className="count">{dueCount}</span>}
        </Link>
      ))}
    </nav>
  );
}
