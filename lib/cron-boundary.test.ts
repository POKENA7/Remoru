import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * cron worker が本体アプリへ HTTP 呼び出しをしないことを固定する（design.md D1）。
 *
 * 先行実装は cron から本体の内部エンドポイントを共有シークレットで叩いており、
 * そのために `/api/internal/(.*)` が認証から除外され、要求本文の userId を
 * 信じる作りになっていた。change 3 で塞いだ穴を、ここで開け直さない。
 */

const CRON_SRC = join(process.cwd(), "cron-worker", "src");

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 再帰的に集める。サブディレクトリに置けば逃げられる、では担保にならない。 */
function collect(dir: string, prefix = ""): { name: string; code: string }[] {
  const out: { name: string; code: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full, `${prefix}${entry}/`));
    else if (entry.endsWith(".ts"))
      out.push({ name: prefix + entry, code: codeOnly(readFileSync(full, "utf8")) });
  }
  return out;
}

/** cron worker が実際に読み込む共有モジュールも検査対象に含める。 */
const SHARED = [
  "notification-timing.ts",
  "notification-message.ts",
  "push.ts",
  "review-scheduler.ts",
].map((f) => ({
  name: `lib/${f}`,
  code: codeOnly(readFileSync(join(process.cwd(), "lib", f), "utf8")),
}));

const FILES = [...collect(CRON_SRC), ...SHARED];

describe("cron worker の依存の向き", () => {
  it("ソースが1つ以上ある", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  for (const { name, code } of FILES) {
    it(`${name} は本体アプリの URL を持たない`, () => {
      expect(code).not.toMatch(/workers\.dev/);
      expect(code).not.toMatch(/remoru\.[a-z0-9-]+\./);
      expect(code).not.toMatch(/localhost:\d+/);
    });

    it(`${name} は内部向けエンドポイントを叩かない`, () => {
      expect(code).not.toMatch(/\/api\//);
      expect(code).not.toMatch(/INTERNAL_SECRET|internal[_-]?secret/i);
    });
  }

  it("fetch はプッシュの送信先にのみ使う", () => {
    // 送信は購読先の endpoint へ出るので fetch 自体は使う。
    // ただし宛先が購読の endpoint 以外であってはならない。
    const fetchCalls = FILES.flatMap(({ name, code }) =>
      [...code.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => ({ name, target: m[1].trim() })),
    );
    for (const { target } of fetchCalls) {
      expect(target).toMatch(/subscription\.endpoint/);
    }
  });

  it("D1 以外のバインディングを持たない", () => {
    // Service Binding を足して env.APP.rpc() を呼ぶ形は fetch( を含まないため
    // ソースの検査では捕まらない。設定の側で塞ぐ。
    const config = readFileSync(join(process.cwd(), "cron-worker", "wrangler.jsonc"), "utf8");
    for (const forbidden of ["services", "durable_objects", "queues", "browser", "ai"]) {
      expect(config).not.toMatch(new RegExp(`"${forbidden}"\\s*:`));
    }
  });

  it("検査対象が空でないこと（vacuous に通らない）", () => {
    const withFetch = FILES.filter((f) => /fetch\(/.test(f.code));
    expect(withFetch.length).toBeGreaterThan(0);
  });

  it("時刻の判定は本体と同じ実装を使う（複製しない）", () => {
    const index = FILES.find((f) => f.name === "index.ts")!;
    expect(index.code).toMatch(/from "\.\.\/\.\.\/lib\/notification-timing"/);
  });
});
