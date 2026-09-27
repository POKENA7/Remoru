import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PLACEHOLDER, cliPath, installSkill, renderSkill } from "./skill.ts";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "remoru-skill-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("renderSkill", () => {
  it("印を CLI の絶対パスに置き換える", () => {
    expect(renderSkill("run node {{REMORU_CLI}} memo list", "/opt/remoru/cli/remoru.ts")).toEqual({
      ok: true,
      text: "run node /opt/remoru/cli/remoru.ts memo list",
    });
  });

  it("空白を含む絶対パスでは置き換えない", () => {
    expect(renderSkill("{{REMORU_CLI}}", "/a b/remoru.ts")).toEqual({
      ok: false,
      reason: "unsafe-cli-path",
    });
  });
});

describe("installSkill", () => {
  it("置き場が無ければ作り、印を絶対パスに置き換えて置く", () => {
    const dir = join(tempDir(), "remoru");
    const result = installSkill(dir);
    expect(result).toEqual({ ok: true, path: join(dir, "SKILL.md") });

    const written = readFileSync(join(dir, "SKILL.md"), "utf8");
    expect(written).not.toContain(PLACEHOLDER);
    expect(written).toContain(`node ${cliPath()} memo list --limit 5`);
    // allowed-tools はその絶対パスの呼び出しだけに絞る（design D9）
    expect(written).toContain(`Bash(node ${cliPath()}:*)`);
    expect(written).not.toContain("Bash(node:*)");
  });

  it("既にあるファイルは上書きする", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "SKILL.md"), "古い内容");

    installSkill(dir);

    const written = readFileSync(join(dir, "SKILL.md"), "utf8");
    expect(written).not.toBe("古い内容");
    expect(written).not.toContain(PLACEHOLDER);
  });

  it("CLI の置き場に空白があれば置かずに断る", () => {
    const dir = tempDir();
    const result = installSkill(dir, { cliPath: "/a b/remoru.ts" });

    expect(result).toEqual({
      ok: false,
      reason: "unsafe-cli-path",
      message: expect.stringContaining("/a b/remoru.ts"),
    });
    expect(() => readFileSync(join(dir, "SKILL.md"), "utf8")).toThrow();
  });
});
