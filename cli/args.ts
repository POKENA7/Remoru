/**
 * 引数の解釈。**純関数だけを置く。** ファイルも通信も触らない。
 *
 * コマンドの形:
 *
 *   remoru login [--token <平文>]
 *   remoru logout
 *   remoru memo add [本文] [-f <ファイル>] [--dry-run] [--json]
 *   remoru memo list [--tag <名前またはid>] [--limit <件数>] [--json]
 *   remoru memo show <id> [--json]
 *   remoru tag list [--json]
 */

export type ParsedCommand =
  | { kind: "help" }
  | { kind: "login"; token: string | null }
  | { kind: "logout" }
  | {
      kind: "memo-add";
      contents: string[];
      file: string | null;
      dryRun: boolean;
      json: boolean;
    }
  | { kind: "memo-list"; tag: string | null; limit: number | null; json: boolean }
  | { kind: "memo-show"; memoId: string; json: boolean }
  | { kind: "tag-list"; json: boolean }
  | { kind: "error"; message: string };

/**
 * 空行で区切られたブロックを1メモとする。
 *
 * 意味の判断（どこで切るのが正しいか）はSKILLを読むAIに任せる。CLIは
 * 決めた規則どおりに切るだけにする（design D8）。
 */
export function splitMemos(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function usage(message: string): ParsedCommand {
  return { kind: "error", message };
}

/** 引数を解釈する。解釈できない形は error を返す（終了コード2）。 */
export function parseArgs(argv: string[]): ParsedCommand {
  const [first, ...rest] = argv;

  if (first === undefined || first === "help" || first === "--help") {
    return { kind: "help" };
  }

  if (first === "login") {
    const token = optionValue(rest, "--token");
    if (token === "") return usage("--token には値が要ります");
    return { kind: "login", token };
  }

  if (first === "logout") {
    return { kind: "logout" };
  }

  if (first === "tag") {
    const [sub, ...tagRest] = rest;
    if (sub !== "list") return usage("tag で使えるのは list だけです");
    const json = hasFlag(tagRest, "--json");
    return { kind: "tag-list", json };
  }

  if (first === "memo") {
    const [sub, ...memoRest] = rest;

    if (sub === "add") {
      const file = optionValue(memoRest, "-f") ?? optionValue(memoRest, "--file");
      if (file === "") return usage("-f には値が要ります");

      // ファイルと本文の両方は受けない。どちらを使ったか分からなくなる
      const words = positionals(memoRest, ["-f", "--file", "--dry-run", "--json"]);
      if (file !== null && words.length > 0) {
        return usage("本文と -f は同時に使えません");
      }
      if (file === null && words.length === 0) {
        return usage("本文か -f のどちらかが要ります");
      }

      return {
        kind: "memo-add",
        contents: file === null ? [words.join(" ")] : [],
        file,
        dryRun: hasFlag(memoRest, "--dry-run"),
        json: hasFlag(memoRest, "--json"),
      };
    }

    if (sub === "list") {
      const tag = optionValue(memoRest, "--tag");
      if (tag === "") return usage("--tag には値が要ります");

      const rawLimit = optionValue(memoRest, "--limit");
      if (rawLimit === "") return usage("--limit には値が要ります");

      let limit: number | null = null;
      if (rawLimit !== null) {
        limit = Number(rawLimit);
        if (!Number.isInteger(limit) || limit <= 0) {
          return usage("--limit には1以上の整数を指定してください");
        }
      }

      return { kind: "memo-list", tag, limit, json: hasFlag(memoRest, "--json") };
    }

    if (sub === "show") {
      const memoId = positionals(memoRest, ["--json"])[0];
      if (memoId === undefined) return usage("memo show には id が要ります");
      return { kind: "memo-show", memoId, json: hasFlag(memoRest, "--json") };
    }

    return usage("memo で使えるのは add / list / show です");
  }

  return usage(`知らないコマンドです: ${first}`);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

/** `--name value` の形の値を取り出す。無ければ null。 */
function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? "";
}

/** オプションとその値を除いた残り。値はオプションの直後にある前提。 */
function positionals(args: string[], names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (names.includes(arg)) {
      // 値を取るオプションは、次の1つを飛ばす
      if (arg !== "--dry-run" && arg !== "--json") i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}
