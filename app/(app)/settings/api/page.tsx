import { ImportTokenSettings } from "@/features/import/components/import-token-settings";
import { getImportToken } from "@/features/import/queries";
import type { ImportTokenState } from "@/features/import/types";

/**
 * API トークンの設定（design D10）。
 *
 * 読み取りはこの経路の Server Component が `features/import/queries.ts` を
 * 通して行う。未認証を止めるのは `(app)/layout.tsx` と `getImportToken()` の
 * `verifySession()`。
 *
 * **トークンが読めなくても画面は出す。** ここで投げると、この画面だけの失敗が
 * エラー境界に落ちる。`null`（「無い」）と混ぜず、`{status:"error"}` で渡して
 * 操作を出させない——発行は古い行を消してから作るので（design D2）、読めなかった
 * だけの利用者に発行させると有効なトークンを消してしまう。
 */
export default async function SettingsApiPage() {
  const tokenState: ImportTokenState = await getImportToken()
    .then((token): ImportTokenState => ({ status: "ok", token }))
    .catch((error): ImportTokenState => {
      console.error("取り込みトークンを読めなかった", error);
      return { status: "error" };
    });

  return <ImportTokenSettings tokenState={tokenState} />;
}
