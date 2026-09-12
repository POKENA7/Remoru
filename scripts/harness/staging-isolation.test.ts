import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * staging が本番の資源を指していないことを固定する（add-staging-environment design D3）。
 *
 * **wrangler の名前付き環境はバインディングを継承しない。** `env.staging` に
 * `d1_databases` を書き忘れると、staging は本番の D1 を指すのではなく DB
 * バインディング無しで起動する。逆に、本番の設定をコピーして `database_id` を
 * 直し忘れると、**staging の操作が本番のデータに当たる**。前者は実行時に落ちて
 * 気づけるが、後者は成功して見える。この検査が主に見ているのは後者である。
 *
 * 見るのは設定ファイルだけで、Cloudflare には問い合わせない。ネットワークと
 * 資格情報に依存する検査は、落ちたときに「規則違反」と「疎通の失敗」を
 * 区別できず、いずれ黙って外される。
 *
 * 判定は純関数 `findStagingIsolationViolations` に閉じてあり、下の
 * 「壊した設定を食わせる」節が**違反を注入して赤くなること**を見る（L06）。
 */

type D1Binding = {
  binding?: string;
  database_name?: string;
  database_id?: string;
};

type WranglerEnv = {
  name?: string;
  d1_databases?: D1Binding[];
};

type WranglerConfig = WranglerEnv & {
  env?: Record<string, WranglerEnv>;
};

/**
 * JSONC からコメントを落として `JSON.parse` に渡せる形にする。
 *
 * 文字列の中の `//`（`"https://…"` など）を消さないよう、文字列とエスケープを
 * 追いながら走る。素朴な正規表現だと `"mailto://x"` の途中から行末までが
 * 消え、設定が壊れたまま「違反なし」になる。
 */
function stripJsonc(src: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * 違反を文の配列で返す。空なら合格。
 *
 * 真偽値ではなく文を返すのは、赤くなったときに**どの規則のどの値が問題か**が
 * 出力に出るようにするため。`expect(ok).toBe(true)` は、直す人に何も渡さない。
 */
function findStagingIsolationViolations(config: WranglerConfig): string[] {
  const violations: string[] = [];
  const staging = config.env?.staging;

  if (!staging) {
    return ["env.staging が無い"];
  }

  if (staging.name === undefined) {
    violations.push("env.staging.name が無い（既定の worker 名を上書きする）");
  } else if (staging.name === config.name) {
    violations.push(`env.staging.name が本番と同じ（${staging.name}）。同じ worker に出荷される`);
  }

  const stagingDbs = staging.d1_databases ?? [];
  if (stagingDbs.length === 0) {
    violations.push(
      "env.staging に d1_databases が無い。バインディングは継承されないので、" +
        "staging は DB 無しで起動する",
    );
  }

  const productionIds = new Set(
    (config.d1_databases ?? []).map((d) => d.database_id).filter(Boolean),
  );
  const productionNames = new Set(
    (config.d1_databases ?? []).map((d) => d.database_name).filter(Boolean),
  );

  for (const db of stagingDbs) {
    if (!db.database_id) {
      violations.push(`env.staging の D1（${db.binding ?? "?"}）に database_id が無い`);
      continue;
    }
    if (productionIds.has(db.database_id)) {
      violations.push(
        `env.staging の D1（${db.binding ?? "?"}）の database_id が本番と同じ` +
          `（${db.database_id}）。staging の操作が本番のデータに当たる`,
      );
    }
    if (db.database_name && productionNames.has(db.database_name)) {
      violations.push(
        `env.staging の D1（${db.binding ?? "?"}）の database_name が本番と同じ` +
          `（${db.database_name}）`,
      );
    }
  }

  return violations;
}

const CONFIGS = [
  { label: "wrangler.jsonc", path: join(process.cwd(), "wrangler.jsonc") },
  {
    label: "cron-worker/wrangler.jsonc",
    path: join(process.cwd(), "cron-worker", "wrangler.jsonc"),
  },
];

describe("staging が本番の資源を指していない", () => {
  for (const { label, path } of CONFIGS) {
    it(`${label} の env.staging は本番から切り離されている`, () => {
      const config = JSON.parse(stripJsonc(readFileSync(path, "utf8"))) as WranglerConfig;
      expect(findStagingIsolationViolations(config)).toEqual([]);
    });
  }
});

/**
 * 検査そのものの検査（L06）。**この節が無いと、上は常に緑の飾りになりうる。**
 *
 * 実ファイルを書き換えて赤を見る手順も 1 度は踏んでいる（tasks 1.4 に実測を
 * 記録した）が、それは再現しない。ここで壊した設定を食わせて固定する。
 */
describe("壊した設定を食わせると赤くなる", () => {
  const production: WranglerConfig = {
    name: "remoru",
    d1_databases: [{ binding: "DB", database_name: "remoru-db", database_id: "prod-id" }],
  };

  it("env.staging が無い", () => {
    expect(findStagingIsolationViolations(production)).toEqual(["env.staging が無い"]);
  });

  it("env.staging に d1_databases が無い（継承されないので DB 無しになる）", () => {
    const violations = findStagingIsolationViolations({
      ...production,
      env: { staging: { name: "remoru-staging" } },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("d1_databases が無い");
  });

  it("staging の database_id が本番と同じ", () => {
    const violations = findStagingIsolationViolations({
      ...production,
      env: {
        staging: {
          name: "remoru-staging",
          d1_databases: [
            { binding: "DB", database_name: "remoru-db-staging", database_id: "prod-id" },
          ],
        },
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("database_id が本番と同じ");
  });

  it("staging の database_name が本番と同じ", () => {
    const violations = findStagingIsolationViolations({
      ...production,
      env: {
        staging: {
          name: "remoru-staging",
          d1_databases: [{ binding: "DB", database_name: "remoru-db", database_id: "staging-id" }],
        },
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("database_name が本番と同じ");
  });

  it("staging の name が本番と同じ（同じ worker を上書きする）", () => {
    const violations = findStagingIsolationViolations({
      ...production,
      env: {
        staging: {
          name: "remoru",
          d1_databases: [
            { binding: "DB", database_name: "remoru-db-staging", database_id: "staging-id" },
          ],
        },
      },
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("name が本番と同じ");
  });

  it("正しい設定は違反なし", () => {
    expect(
      findStagingIsolationViolations({
        ...production,
        env: {
          staging: {
            name: "remoru-staging",
            d1_databases: [
              {
                binding: "DB",
                database_name: "remoru-db-staging",
                database_id: "staging-id",
              },
            ],
          },
        },
      }),
    ).toEqual([]);
  });
});

/**
 * コメント落としが文字列を壊さないことを見る。ここが壊れると `JSON.parse` が
 * 落ちるか、**設定の一部が消えたまま「違反なし」になる**。
 */
describe("stripJsonc", () => {
  it("行コメントと区画コメントを落とす", () => {
    const src = '{\n  // これは注釈\n  "a": 1, /* 区画 */\n  "b": 2\n}';
    expect(JSON.parse(stripJsonc(src))).toEqual({ a: 1, b: 2 });
  });

  it("文字列の中の // を残す", () => {
    const src = '{ "url": "https://example.com/x", "sub": "mailto:a@b.c" }';
    expect(JSON.parse(stripJsonc(src))).toEqual({
      url: "https://example.com/x",
      sub: "mailto:a@b.c",
    });
  });

  it("エスケープされた引用符に惑わされない", () => {
    const src = '{ "a": "say \\" // not a comment", "b": 1 }';
    expect(JSON.parse(stripJsonc(src))).toEqual({ a: 'say " // not a comment', b: 1 });
  });
});
