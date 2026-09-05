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
    expect(bar).toMatch(/<Link\b/);
    // クライアント状態でタブを切り替える形に戻っていないこと。
    // `useState` そのものは禁じない——絞り込みの引き継ぎに使っている
    expect(bar).not.toMatch(/router\.push/);
    expect(bar).not.toMatch(/onClick=/);
    for (const label of ["メモ", "復習", "記録"]) {
      expect(bar).toContain(`label: "${label}"`);
    }
    expect(bar).toContain('href: "/review"');
    expect(bar).toContain('href: "/record"');
    // メモは絞り込みを引き継ぐので素の "/" ではない
    expect(bar).toMatch(/memosHref/);
  });
});

describe("戻る操作は直前に見ていた画面へ返す", () => {
  const read = (...seg: string[]) => readFileSync(join(ROOT, ...seg), "utf8");

  it("詳細は履歴を積んで開く", () => {
    // クライアント状態で開くと履歴に何も積まれず、端末の戻る操作は
    // 一覧へ戻らずアプリの外へ抜ける（navigation spec の MUST NOT）
    const screen = read("features", "memo", "components", "memo-screen.tsx");
    expect(screen).toMatch(/router\.push\(/);
    expect(screen).toMatch(/`\/memos\/\$\{memo\.id\}`/);
  });

  it("絞り込みは復習・記録を経由しても引き継がれる", () => {
    // `/review` と `/record` は絞り込みを持たないので、経路だけを見ていると
    // 復習へ移って戻った瞬間に外れる（レビューの指摘、ブラウザで再現した）。
    // メモ側の経路にいる間に憶えておき、持たない画面ではそれを使う
    const bar = read("app", "(app)", "tab-bar.tsx");
    expect(bar).toMatch(/sessionStorage\.setItem\("remoru:tag"/);
    expect(bar).toMatch(/sessionStorage\.removeItem\("remoru:tag"/);
    // 憶えるのはメモ側にいるときだけ。復習で null を憶えると戻り先が素の一覧になる
    expect(bar).toMatch(/if \(!onMemoRoute\) return;/);
  });

  it("詳細の経路が絞り込みを憶えている", () => {
    // PWA にはブラウザの戻るが無く、下部タブが戻り道になる。詳細にいる間も
    // 経路が絞り込みを持っていないと、タブで戻った瞬間に外れる
    // （memo-capture「戻ったときに絞り込みの状態を保つ」／実機で発覚）
    const screen = read("features", "memo", "components", "memo-screen.tsx");
    expect(screen).toMatch(/\/memos\/\$\{memo\.id\}\?tag=/);

    const bar = read("app", "(app)", "tab-bar.tsx");
    expect(bar).toMatch(/useSearchParams\(\)\.get\("tag"\)/);
  });

  it("詳細を閉じるのは履歴を戻る", () => {
    // `router.push("/")` にすると履歴が伸び続け、押した回数だけ戻ることになる。
    // また絞り込み（?tag=）も失われる
    const screen = read("features", "memo", "components", "memo-detail-screen.tsx");
    expect(screen).toMatch(/router\.back\(\)/);
    expect(screen).not.toMatch(/router\.push\("\/"\)/);
  });

  it("消したあとは戻らず一覧へ送る", () => {
    // 戻ると、消したメモの経路が履歴に残っているので「見つかりません」に当たる
    const screen = read("features", "memo", "components", "memo-detail-screen.tsx");
    expect(screen).toMatch(/onDeleted=\{\(\) => router\.replace\("\/"\)\}/);
  });

  it("無いメモには「見つかりません」を出す", () => {
    // 真っ白にせず、一覧へ戻る手段を残す（memo-capture spec）
    expect(existsSync(join(ROOT, "app", "(app)", "memos", "[memoId]", "not-found.tsx"))).toBe(true);
    const nf = read("app", "(app)", "memos", "[memoId]", "not-found.tsx");
    expect(nf).toMatch(/href="\/"/);
  });

  it("他人のメモと消えたメモを区別しない", () => {
    // 区別すると、id の総当たりで「そのメモが存在するか」だけ分かってしまう
    const container = read("app", "(app)", "_containers", "memo-detail", "container.tsx");
    expect(container).toMatch(/if \(!memo\) notFound\(\)/);
    const memos = read("features", "memo", "memos.ts");
    expect(memos).toMatch(/eq\(memos\.userId, userId\)/);
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

  it("通知で復習へ移るとき、設定は閉じる", () => {
    // すでに /review にいると同じ経路への遷移なので再 mount されない。
    // 設定を開いたままだと「復習を始められる画面」が出ない
    const screen = readFileSync(
      join(ROOT, "features", "review", "components", "review-screen.tsx"),
      "utf8",
    );
    expect(screen).toMatch(/remoru:open-review/);
    expect(screen).toMatch(/setSettingsOpen\(false\)/);
  });

  it("すでに開いているときは開き直さない", () => {
    // spec「すでにアプリが開いているとき」。開いている窓へ postMessage して
    // 経路を移す。openWindow は見つからなかったときだけ
    const sw = readFileSync(join(ROOT, "public", "sw.js"), "utf8");
    expect(sw).toMatch(/postMessage\(\{\s*type:\s*"remoru:open-review"/);
  });
});
