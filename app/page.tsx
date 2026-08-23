import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { AppShell } from "./app-shell";

/**
 * 未認証を資源の側で止める。
 *
 * design.md D3: middleware（proxy.ts）は使わない。理由は2つある。
 * OpenNext が Node.js ランタイムの middleware を支援しておらず
 * Cloudflare Workers 上でビルドが通らないこと。そして Clerk 自身が
 * 「middleware のパス一致は Next.js のルーティングと乖離しうるため、
 * 保護されるべき資源に到達できる場合がある」として非推奨にしていること。
 *
 * API ルートは各自が getCurrentUserId() を確認して 401 を返す。
 * 画面はここで確認してサインインへ送る。
 */
export default async function Page() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in");

  return <AppShell />;
}
