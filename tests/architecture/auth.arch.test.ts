import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FEATURES = join(ROOT, "features");

/** 書き込みの入口。`features/<機能>/actions.ts` に置く（design.md D1）。 */
function actionFiles(): { name: string; code: string }[] {
  return readdirSync(FEATURES)
    .filter((d) => existsSync(join(FEATURES, d, "actions.ts")))
    .map((d) => ({
      name: `features/${d}/actions.ts`,
      code: codeOnly(readFileSync(join(FEATURES, d, "actions.ts"), "utf8")),
    }));
}

const ACTIONS = actionFiles();

/** export された関数ごとに、その関数の本体だけを切り出す。 */
function exportedFunctions(src: string): [string, string][] {
  const found: [string, string][] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;

  for (const match of src.matchAll(re)) {
    // 引数の分割代入を本体と取り違えないよう、まず引数の丸括弧を閉じる
    let parens = 0;
    let afterArgs = (match.index ?? 0) + match[0].length - 1;
    for (let i = afterArgs; i < src.length; i++) {
      if (src[i] === "(") parens++;
      else if (src[i] === ")") {
        parens--;
        if (parens === 0) {
          afterArgs = i;
          break;
        }
      }
    }
    const start = src.indexOf("{", afterArgs);
    let depth = 0;
    let end = start;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    found.push([match[1], src.slice(start, end + 1)]);
  }
  return found;
}

/**
 * export された関数の「引数の並び」だけを切り出す。
 *
 * 本体は `exportedFunctions` が返すので、こちらは型注釈を読むために使う。
 */
function exportedSignatures(src: string): [string, string][] {
  const found: [string, string][] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;

  for (const match of src.matchAll(re)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let parens = 0;
    let close = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") parens++;
      else if (src[i] === ")") {
        parens--;
        if (parens === 0) {
          close = i;
          break;
        }
      }
    }
    found.push([match[1], src.slice(open + 1, close)]);
  }
  return found;
}

/**
 * 引数の並びを、深さ 0 のカンマで割って `名前: 型` に分ける。
 *
 * オブジェクト型の中のカンマで割らないよう、括弧の深さを数える。
 */
function topLevelParams(args: string): { param: string; type: string }[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of args) {
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);

  return parts.flatMap((part) => {
    const colon = part.indexOf(":");
    if (colon === -1) return [];
    const param = part.slice(0, colon).trim();
    // 使わない引数（`_prev` など）は呼び出し側が形を決められない
    if (!/^\w+$/.test(param) || param.startsWith("_")) return [];
    return [{ param, type: part.slice(colon + 1).trim() }];
  });
}

describe("Server Actions の認証", () => {
  it("走査対象が空でない", () => {
    // 置き場を間違えて 0 件になっても、下の検査は緑になってしまう（L06）
    expect(ACTIONS.length).toBeGreaterThan(3);
  });

  for (const { name, code } of ACTIONS) {
    it(`${name} は "use server" を宣言している`, () => {
      // 宣言が無いと、ここは普通のモジュールとしてクライアントへ束ねられる
      expect(code).toMatch(/^\s*["']use server["']/);
    });

    /**
     * **関数単位で見る。** ファイル単位だと、1 つの action から
     * `verifySession()` を消しても、同じファイルの別の action の分に
     * 一致して緑のままになる。`features/tag/actions.ts` は 5 つ持っている。
     */
    const functions = exportedFunctions(code);

    it(`${name} は export された関数を持つ`, () => {
      expect(functions.length).toBeGreaterThan(0);
    });

    for (const [fn, body] of functions) {
      it(`${name} の ${fn} は自分でセッションを確かめている`, () => {
        /*
         * Server Action は**公開された POST の宛先**である。呼び出し元の画面が
         * 認証済みであることは、認証済みの呼び出ししか来ない担保にならない
         * （design.md D6）。画面の描画で守ろうとすると、UI を経由しない
         * 要求が素通りする。
         */
        expect(body).toMatch(/verifySession\(\)/);
      });

      it(`${name} の ${fn} は try の外でセッションを確かめている`, () => {
        /*
         * **`verifySession()` は未認証のとき `redirect()` で投げる。**
         * try の中で呼ぶと、その `NEXT_REDIRECT` を `catch` が飲み込み、
         * セッションの切れた利用者はサインインへ飛ばされずに「保存できません
         * でした」を見る（design.md D4）。
         *
         * 型でも実行でも出ない。**レビューで指摘されて初めて見つかった**ので、
         * 検査にする。
         */
        const auth = body.indexOf("verifySession()");
        const guard = body.indexOf("try {");
        expect(auth, "verifySession() の呼び出しが見つからない").toBeGreaterThan(-1);
        if (guard === -1) return; // try で包んでいない action もありうる
        expect(auth).toBeLessThan(guard);
      });
    }

    /**
     * **型注釈は実行時に消える。**
     *
     * Server Action は公開された POST の宛先なので、宣言と違う値が届く。
     * とくに `boolean` と `number` が危ない——`recalled: boolean` に文字列
     * `"false"` が届くと `if (!outcome.recalled)` を素通りし、「忘れてた」が
     * 「覚えてた」として記録される。**型でも実行でも出ず、復習の間隔だけが
     * 静かに壊れる。** Route Handler にはあった検査で、action へ移したときに
     * 落としていた（レビューで指摘された）。
     *
     * 見るのは**引数そのものが `boolean` / `number` の場合**だけ。オブジェクトを
     * 受け取る action は、下の検査で `validate…()` を通すことを求める。
     * 文字列はどちらでも見ない——ドメイン側の検証が `.trim()` などで throw し、
     * `catch` が失敗に倒すため（それでも各 action で確かめてはいる）。
     */
    for (const [fn, args] of exportedSignatures(code)) {
      const body = functions.find(([n]) => n === fn)?.[1] ?? "";

      for (const { param, type } of topLevelParams(args)) {
        if (type === "boolean") {
          it(`${name} の ${fn} は ${param} が本当に boolean か確かめている`, () => {
            expect(body).toMatch(new RegExp(`typeof\\s+${param}\\s*!==\\s*["']boolean["']`));
          });
        }
        if (type === "number") {
          it(`${name} の ${fn} は ${param} が本当に number か確かめている`, () => {
            expect(body).toMatch(
              new RegExp(
                `Number\\.isFinite\\(\\s*${param}|typeof\\s+${param}\\s*!==\\s*["']number["']`,
              ),
            );
          });
        }
        if (type.startsWith("{") || type.endsWith("[]")) {
          it(`${name} の ${fn} は ${param} の形を実行時に確かめている`, () => {
            // オブジェクトや配列は 1 つずつ typeof で書くと長い。
            // `validate…()` に通すか、`Array.isArray` で入口を閉じる
            expect(body).toMatch(
              new RegExp(`validate\\w*\\(\\s*${param}|Array\\.isArray\\(\\s*${param}`),
            );
          });
        }
      }
    }

    it(`${name} は利用者の識別子を引数で受け取っていない`, () => {
      // 値を渡せる構造にすると、差し替えるだけで他人のデータに到達できる
      expect(code).not.toMatch(/\buserId\s*:\s*string\b/);
      expect(code).not.toMatch(/userId\s*[:=]\s*(params|args|input)\b/);
    });
  }

  it("Route Handler は残っていない", () => {
    /*
     * 書き込みは全部 Server Actions に移った（design.md D9）。`app/api/` が
     * 戻ってきたら気づけるようにする。**この検査が無いと、上の走査対象が
     * `actions.ts` だけなので、Route Handler を足しても誰も見ない。**
     *
     * サイト外からの操作（Webhook など）で必要になったら、そのときここを直す。
     */
    expect(existsSync(join(ROOT, "app", "api"))).toBe(false);
  });
});

describe("画面の保護", () => {
  /**
   * 画面を出すルートを集める。**置き場を直書きしない**（design.md D8）。
   *
   * 保護は `app/(app)/layout.tsx` が担う。ルートグループを足したり
   * 経路を増やしたりしても、この検査が対象を見失わないようにする。
   */
  function appFiles(): { name: string; code: string }[] {
    const out: { name: string; code: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          // 認証画面そのものと API は対象外
          if (entry === "api" || entry.startsWith("sign-")) continue;
          walk(full);
        } else if (entry === "page.tsx" || entry === "layout.tsx") {
          out.push({
            name: full.slice(ROOT.length + 1),
            code: codeOnly(readFileSync(full, "utf8")),
          });
        }
      }
    };
    walk(join(ROOT, "app"));
    return out;
  }

  const APP_FILES = appFiles();

  it("走査対象が空でない", () => {
    expect(APP_FILES.length).toBeGreaterThan(2);
  });

  it("画面の枠がサーバー側で利用者を確認している", () => {
    // どこか 1 つの layout / page が認証を確かめていればよい、では足りない。
    // 「タブを持つ画面すべてを覆う枠」が確かめていることを見る
    const guard = APP_FILES.find((f) => f.name === "app/(app)/layout.tsx");
    expect(guard).toBeDefined();
    expect(guard?.code).toMatch(/verifySession\s*\(/);
  });

  it("未認証はサインインへ送る", () => {
    // 送る先は verifySession() が持つ
    const session = codeOnly(readFileSync(join(ROOT, "lib", "session.ts"), "utf8"));
    expect(session).toMatch(/redirect\(\s*["']\/sign-in["']\s*\)/);
  });

  it('画面のルートは "use client" ではない（クライアントでは認証を判断しない）', () => {
    const client = APP_FILES.filter((f) => /^\s*["']use client["']/m.test(f.code)).map(
      (f) => f.name,
    );
    expect(client).toEqual([]);
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
  /**
   * design.md D8: **置き場を直書きしない。** モジュールが `lib/` から
   * `features/<機能>/` へ移ったとき、走査範囲を `lib/` に固定したままだと
   * 検査は落ちも警告もせず、ただ何も見なくなる（L06）。
   *
   * 対象は「ドメインを持つ層」全部——`features/**` と、横断として残る `lib/`。
   */
  function domainFiles(): { name: string; src: string }[] {
    const out: { name: string; src: string }[] = [];
    const dirs = [join(ROOT, "lib")];
    const featuresRoot = join(ROOT, "features");
    if (existsSync(featuresRoot)) {
      for (const d of readdirSync(featuresRoot)) {
        const full = join(featuresRoot, d);
        if (statSync(full).isDirectory()) dirs.push(full);
      }
    }
    for (const dir of dirs) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
        const full = join(dir, f);
        out.push({ name: full.slice(ROOT.length + 1), src: readFileSync(full, "utf8") });
      }
    }
    return out;
  }

  const DOMAIN = domainFiles();

  it("走査対象が空でない", () => {
    // 走査範囲を間違えて 0 件になっても、下の検査は緑になってしまう
    expect(DOMAIN.length).toBeGreaterThan(10);
  });

  for (const stem of ["memos", "quiz-items", "review", "review-scheduler"]) {
    it(`${stem}.ts は認証事業者を import していない`, () => {
      const found = DOMAIN.filter((f) => f.name.endsWith(`/${stem}.ts`));
      // 置き場が変わっても、消えたことには気づけるようにする
      expect(found).toHaveLength(1);
      expect(found[0].src).not.toMatch(/@clerk/);
    });
  }

  it("Clerk を知るのはセッションの 1 ファイルだけ", () => {
    const importers = DOMAIN.filter((f) => f.src.includes("@clerk")).map((f) => f.name);
    expect(importers).toEqual(["lib/session.ts"]);
  });
});
