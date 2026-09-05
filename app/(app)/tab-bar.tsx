"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  const tabs = [
    { href: "/", label: "メモ" },
    { href: "/review", label: "復習" },
    { href: "/record", label: "記録" },
  ] as const;

  return (
    <nav className="tabs" role="tablist">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          role="tab"
          className="tab"
          // メモの詳細（/memos/…）を開いている間も「メモ」を選ばれた状態にする。
          // 詳細は一覧から入る画面で、別のタブではない
          aria-selected={
            tab.href === "/"
              ? pathname === "/" || pathname.startsWith("/memos/")
              : pathname === tab.href
          }
        >
          <i />
          {tab.label}
          {tab.href === "/review" && dueCount > 0 && <span className="count">{dueCount}</span>}
        </Link>
      ))}
    </nav>
  );
}
