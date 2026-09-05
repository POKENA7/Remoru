import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_URL } from "@/features/notification/notification-message";

/**
 * 画面が固有の経路を持つことを固定する（navigation spec）。
 *
 * 経路はファイルの置き場そのものなので、存在を見るだけで担保できる。
 * **中身が正しいかは見ない**——それは画面ごとのテストと実機の仕事。
 */

const ROOT = process.cwd();

/** ルートグループ `(app)` は URL に現れない。経路 -> 実ファイルの対応 */
const ROUTES = [
  { path: "/", file: "app/(app)/page.tsx" },
  { path: "/review", file: "app/(app)/review/page.tsx" },
  { path: "/record", file: "app/(app)/record/page.tsx" },
  { path: "/memos/:memoId", file: "app/(app)/memos/[memoId]/page.tsx" },
] as const;

describe("主要な画面は固有の経路を持つ", () => {
  for (const { path, file } of ROUTES) {
    it(`${path} が ${file} にある`, () => {
      expect(existsSync(join(ROOT, file))).toBe(true);
    });
  }

  it("タブを持つ画面は 1 つの枠に覆われている", () => {
    // 認証と下部タブをここが引き受ける。経路を足しても覆われる
    expect(existsSync(join(ROOT, "app/(app)/layout.tsx"))).toBe(true);
  });

  it("下部タブは <Link> で、経路を移る", () => {
    const bar = readFileSync(join(ROOT, "app/(app)/tab-bar.tsx"), "utf8");
    expect(bar).toMatch(/from "next\/link"/);
    // クライアント状態でタブを切り替える形に戻っていないこと
    expect(bar).not.toMatch(/useState/);
    for (const href of ["/", "/review", "/record"]) {
      expect(bar).toContain(`href: "${href}"`);
    }
  });
});

describe("通知から復習の経路へ入る", () => {
  it("通知のタップ先が復習の経路である", () => {
    expect(REVIEW_URL).toBe("/review");
  });

  it("Service Worker の既定の行き先も復習の経路である", () => {
    // 本文が壊れて url を持たなかったときに開く先。ここだけ古い経路が
    // 残ると、通知の一部だけが動かなくなる
    const sw = readFileSync(join(ROOT, "public", "sw.js"), "utf8");
    expect(sw).toMatch(/const FALLBACK_URL = "\/review";/);
    expect(sw).not.toMatch(/tab=review/);
  });

  it("すでに開いているときは開き直さない", () => {
    // spec「すでにアプリが開いているとき」。開いている窓へ postMessage して
    // 経路を移す。openWindow は見つからなかったときだけ
    const sw = readFileSync(join(ROOT, "public", "sw.js"), "utf8");
    expect(sw).toMatch(/postMessage\(\{\s*type:\s*"remoru:open-review"/);
  });
});
