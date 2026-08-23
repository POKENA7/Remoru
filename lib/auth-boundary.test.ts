import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 認証の境界を検査で固定する。
 *
 * design.md D2: 利用者の識別子を要求から受け取らない
 * design.md D3: 未認証を止める。除外は認証画面と Clerk の経路だけ
 * design.md D5: 分離は「気をつける」では守れないので検査する
 *
 * Clerk 自身が createRouteMatcher の非推奨化にあたり「middleware のパス一致は
 * Next.js のルーティングと乖離しうるため、保護されるべき資源に到達できる場合が
 * ある」と警告している。したがって middleware だけに依存せず、各ルートが
 * 単独で認証を確認していることをここで担保する。
 */

const ROOT = process.cwd();

/** コメントを除いた本体だけを返す。言及と使用を区別するため。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

const ROUTES = routeFiles(join(ROOT, "app", "api"));

describe("API ルートの認証", () => {
  it("ルートが1つ以上見つかる", () => {
    expect(ROUTES.length).toBeGreaterThan(0);
  });

  for (const file of ROUTES) {
    const rel = file.slice(ROOT.length + 1);
    const src = codeOnly(readFileSync(file, "utf8"));

    it(`${rel} はセッションから利用者を得ている`, () => {
      expect(src).toMatch(/getCurrentUserId\s*\(/);
    });

    it(`${rel} は未認証を自前で弾いている（middleware だけに頼らない）`, () => {
      expect(src).toMatch(/if\s*\(\s*!userId\s*\)/);
      expect(src).toMatch(/401/);
    });

    it(`${rel} は要求由来の値を userId に渡していない`, () => {
      // body / searchParams / params から取り出した値が userId に入る形を禁じる
      expect(src).not.toMatch(/userId\s*[:=]\s*(body|params|searchParams)\b/);
      expect(src).not.toMatch(/userId\s*[:=]\s*await\s+req\b/);
      expect(src).not.toMatch(/\buserId\b\s*[:=]\s*\(?\s*body\s*(as|\.)/);
      // 分割代入で body から userId を取り出す形も禁じる
      expect(src).not.toMatch(/const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*\(?\s*body/);
    });
  }
});

describe("画面の保護", () => {
  const page = codeOnly(readFileSync(join(ROOT, "app", "page.tsx"), "utf8"));

  it("サーバー側で利用者を確認している", () => {
    expect(page).toMatch(/getCurrentUserId\s*\(/);
  });

  it("未認証はサインインへ送る", () => {
    expect(page).toMatch(/redirect\(\s*["']\/sign-in["']\s*\)/);
  });

  it('"use client" ではない（クライアントでは認証を判断しない）', () => {
    expect(page).not.toMatch(/^\s*["']use client["']/m);
  });
});

describe("middleware の役割", () => {
  it("proxy.ts ではなく middleware.ts を使っている", () => {
    // Next.js 16 の proxy は Node.js ランタイム固定で OpenNext が支援しない。
    // middleware は Edge で動き、Cloudflare Workers 上でビルドが通る。
    expect(existsSync(join(ROOT, "middleware.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "proxy.ts"))).toBe(false);
  });

  it("middleware は保護を担っていない（文脈の用意だけ）", () => {
    // 保護は資源側。middleware のパス一致に依存すると漏れうる（Clerk の警告）。
    const mw = codeOnly(readFileSync(join(ROOT, "middleware.ts"), "utf8"));
    expect(mw).not.toMatch(/createRouteMatcher/);
    expect(mw).not.toMatch(/auth\.protect\(/);
  });
});

describe("ドメイン層の依存", () => {
  for (const name of ["memos", "quiz-items", "review", "review-scheduler"]) {
    it(`lib/${name}.ts は認証事業者を import していない`, () => {
      const src = readFileSync(join(ROOT, "lib", `${name}.ts`), "utf8");
      expect(src).not.toMatch(/@clerk/);
    });
  }

  it("Clerk を知るのは lib/current-user.ts だけ", () => {
    const libFiles = readdirSync(join(ROOT, "lib"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const importers = libFiles.filter((f) =>
      readFileSync(join(ROOT, "lib", f), "utf8").includes("@clerk"),
    );
    expect(importers).toEqual(["current-user.ts"]);
  });
});
