import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * トークンの置き場と、APIのあて先。
 *
 * 環境変数で差し替えられるようにしてある。テストが本物の設定を触らずに
 * 済み、利用者も別の環境へ向けられる（design D7）。
 */

/** 本番のあて先。staging へ向けるときは `REMORU_API_URL` で差し替える。 */
export const DEFAULT_API_URL = "https://remoru.pokena191.workers.dev";

export function apiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.REMORU_API_URL ?? DEFAULT_API_URL;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.REMORU_CONFIG_DIR ?? join(homedir(), ".config", "remoru");
}

export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), "token");
}

/** 保存された平文。無ければ null。 */
export function readToken(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const token = readFileSync(tokenPath(env), "utf8").trim();
    return token.length > 0 ? token : null;
  } catch {
    // ファイルが無い・読めないときは、未ログインとして扱う
    return null;
  }
}

/**
 * 平文を保存する。
 *
 * 置き場は利用者のホームの下である。**リポジトリの中には置かない。**
 * 誤ってコミットすると、取り込みを許す鍵が公開される。
 */
export function writeToken(token: string, env: NodeJS.ProcessEnv = process.env): void {
  const dir = configDir(env);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = tokenPath(env);
  writeFileSync(path, `${token}\n`);
  // `writeFileSync` の mode は新規作成のときだけ効く。既にあるファイルを
  // 緩い権限で上書きしても 0600 になるよう、必ず締め直す
  chmodSync(path, 0o600);
}

export function clearToken(env: NodeJS.ProcessEnv = process.env): void {
  rmSync(tokenPath(env), { force: true });
}
