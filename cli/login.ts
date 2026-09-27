import { type Api, type TokenCheckReason, checkToken } from "./api.ts";
import { tokenPath, writeToken } from "./store.ts";

/**
 * login の手順。**保存する前にトークンが使えるかを確かめる**（design D7）。
 *
 * 401・通信の失敗・その他の失敗では保存しない。既に保存されたトークンが
 * あっても消さない——新しいトークンが保存されないだけである。貼り付け
 * 間違いを保存すると、次に登録するときまで誤りに気づけない。
 *
 * 判定と保存を1つにまとめ、ストア（`REMORU_CONFIG_DIR`）を一時ディレクトリに
 * 向けて「保存しない」をテストできるようにする。文言は `output.ts` が持つ。
 */

export type LoginResult = { ok: true; path: string } | { ok: false; reason: TokenCheckReason };

export async function loginWithToken(
  api: Api,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoginResult> {
  const check = await checkToken(api);
  if (!check.ok) return { ok: false, reason: check.reason };

  writeToken(token, env);
  return { ok: true, path: tokenPath(env) };
}
