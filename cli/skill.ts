import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SKILL の配置（design D9）。
 *
 * SKILL は Remoru のリポジトリの外で調査している AI に読まれる。元の文書に
 * **絶対パスで呼べる形**へ置き換えるための印を置き、`skill install` が
 * 利用者単位の置き場へ書き込む。置き換え（純関数）と書き込みを分けて、
 * 書き込みをせずに置き換えだけをテストできるようにする。
 */

/** 元の文書の中で、CLI の絶対パスに置き換える印。 */
export const PLACEHOLDER = "{{REMORU_CLI}}";

/**
 * CLI 自身の絶対パス。**作業中のディレクトリではなく、このファイルの位置**から
 * 求める（design D7・D9）。どこから呼んでも同じ結果になる。
 */
export function cliPath(): string {
  return fileURLToPath(new URL("./remoru.ts", import.meta.url));
}

/** 元の文書（`cli/skill/SKILL.md`）の絶対パス。 */
export function skillTemplatePath(): string {
  return fileURLToPath(new URL("./skill/SKILL.md", import.meta.url));
}

/** SKILL の既定の置き場（利用者単位。design D9）。 */
export function defaultSkillDir(): string {
  return join(homedir(), ".claude", "skills", "remoru");
}

export type RenderedSkill = { ok: true; text: string } | { ok: false; reason: "unsafe-cli-path" };

/**
 * 印を CLI の絶対パスに置き換える。**純関数。**
 *
 * 絶対パスに空白があると、SKILL に書いた `node <絶対パス> …` がシェルで
 * 2語に割れる。引用する手もあるが、Claude Code の `allowed-tools` の
 * 照合が引用を受け付ける保証が無いため、**install を断る**側に倒す。
 */
export function renderSkill(template: string, cli: string): RenderedSkill {
  if (/\s/.test(cli)) return { ok: false, reason: "unsafe-cli-path" };
  return { ok: true, text: template.replaceAll(PLACEHOLDER, cli) };
}

export type SkillInstallResult =
  | { ok: true; path: string }
  | { ok: false; reason: "unsafe-cli-path"; message: string };

/**
 * 置き換えた SKILL を `dir` へ書く。無ければ作る。**既にあれば上書きする**
 * （CLI を更新したときに入れ直せるように。design D9）。
 *
 * CLI の絶対パスと元の文書は既定で CLI 自身の位置から求める。テストが
 * 差し替えられるよう、どちらも引数で渡せるようにしてある。
 */
export function installSkill(
  dir: string,
  options: { cliPath?: string; templatePath?: string } = {},
): SkillInstallResult {
  const cli = options.cliPath ?? cliPath();
  const template = readFileSync(options.templatePath ?? skillTemplatePath(), "utf8");
  const rendered = renderSkill(template, cli);

  if (!rendered.ok) {
    return {
      ok: false,
      reason: "unsafe-cli-path",
      message: `CLI の置き場に空白があります。この場所では手順の文書を置けません: ${cli}`,
    };
  }

  mkdirSync(dir, { recursive: true });
  const target = join(dir, "SKILL.md");
  writeFileSync(target, rendered.text);
  return { ok: true, path: target };
}
