import { describe, expect, it } from "vitest";
import { parseArgs, splitMemos } from "./args.ts";

describe("parseArgs", () => {
  it("引数が無ければヘルプ", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
  });

  it("login は --token を受ける", () => {
    expect(parseArgs(["login", "--token", "rem_abc"])).toEqual({
      kind: "login",
      token: "rem_abc",
    });
  });

  it("login は --token が無ければ null（標準入力から読む）", () => {
    expect(parseArgs(["login"])).toEqual({ kind: "login", token: null });
  });

  it("--token に値が無ければエラー", () => {
    expect(parseArgs(["login", "--token"]).kind).toBe("error");
  });

  it("logout", () => {
    expect(parseArgs(["logout"])).toEqual({ kind: "logout" });
  });

  it("skill install は --dir を受ける", () => {
    expect(parseArgs(["skill", "install", "--dir", "/tmp/remoru"])).toEqual({
      kind: "skill-install",
      dir: "/tmp/remoru",
    });
  });

  it("skill install は --dir が無ければ null（既定の置き場を使う）", () => {
    expect(parseArgs(["skill", "install"])).toEqual({ kind: "skill-install", dir: null });
  });

  it("skill install は --dir の値の付け忘れをエラーにする", () => {
    expect(parseArgs(["skill", "install", "--dir"]).kind).toBe("error");
  });

  it("skill で使えるのは install だけ", () => {
    expect(parseArgs(["skill", "remove"]).kind).toBe("error");
  });

  it("memo add は本文を1件として受ける", () => {
    expect(parseArgs(["memo", "add", "近所のパン屋は火曜定休"])).toEqual({
      kind: "memo-add",
      contents: ["近所のパン屋は火曜定休"],
      file: null,
      dryRun: false,
      json: false,
    });
  });

  it("memo add は複数の語を空白でつなぐ", () => {
    const parsed = parseArgs(["memo", "add", "火曜", "定休"]);
    expect(parsed).toMatchObject({ contents: ["火曜 定休"] });
  });

  it("memo add は -f と --dry-run を受ける", () => {
    expect(parseArgs(["memo", "add", "-f", "notes.md", "--dry-run"])).toEqual({
      kind: "memo-add",
      contents: [],
      file: "notes.md",
      dryRun: true,
      json: false,
    });
  });

  it("memo add は本文と -f の同時指定を拒む", () => {
    expect(parseArgs(["memo", "add", "本文", "-f", "notes.md"]).kind).toBe("error");
  });

  it("memo add は本文も -f も無ければエラー", () => {
    expect(parseArgs(["memo", "add"]).kind).toBe("error");
  });

  it("memo list は --tag と --limit と --json を受ける", () => {
    expect(parseArgs(["memo", "list", "--tag", "店", "--limit", "5", "--json"])).toEqual({
      kind: "memo-list",
      tag: "店",
      limit: 5,
      json: true,
    });
  });

  it("memo list の --limit は1以上の整数だけ", () => {
    expect(parseArgs(["memo", "list", "--limit", "0"]).kind).toBe("error");
    expect(parseArgs(["memo", "list", "--limit", "x"]).kind).toBe("error");
  });

  it("memo show は id を受ける", () => {
    expect(parseArgs(["memo", "show", "abc", "--json"])).toEqual({
      kind: "memo-show",
      memoId: "abc",
      json: true,
    });
  });

  it("memo show は id が無ければエラー", () => {
    expect(parseArgs(["memo", "show"]).kind).toBe("error");
  });

  it("tag list", () => {
    expect(parseArgs(["tag", "list"])).toEqual({ kind: "tag-list", json: false });
  });

  it("知らないコマンドはエラー", () => {
    expect(parseArgs(["nope"]).kind).toBe("error");
    expect(parseArgs(["memo", "remove"]).kind).toBe("error");
  });
});

describe("splitMemos", () => {
  it("空行で区切る", () => {
    expect(splitMemos("ひとつめ\n\nふたつめ")).toEqual(["ひとつめ", "ふたつめ"]);
  });

  it("空行の空白を許す", () => {
    expect(splitMemos("ひとつめ\n   \nふたつめ")).toEqual(["ひとつめ", "ふたつめ"]);
  });

  it("前後の空白と空のブロックを落とす", () => {
    expect(splitMemos("\n\n  あ  \n\n\n  \nい\n\n")).toEqual(["あ", "い"]);
  });

  it("区切りが無ければ1件", () => {
    expect(splitMemos("改行の\n中身は残す")).toEqual(["改行の\n中身は残す"]);
  });
});
