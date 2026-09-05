import { getDue } from "@/features/review/queries";
import { verifySession } from "@/lib/session";
import { NotificationBridge } from "./notification-bridge";
import { TabBar } from "./tab-bar";

/**
 * タブを持つ画面の枠。
 *
 * design.md D1: **枠は Server Components のまま。** 下部タブは `<Link>` で、
 * いま選ばれているのはどれかを知る `TabBar` だけがクライアントで動く。
 *
 * design.md D3（過去の change）: 未認証はここで止める。middleware では守らない
 * ——Clerk 自身が「middleware のパス一致は Next.js のルーティングと乖離しうる」
 * と警告している。各 feature の `queries.ts` も自分で確かめるので、
 * ここを通らない経路があってもデータは出ない。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await verifySession();

  // 復習の件数はタブのバッジに出る。枠の一部なのでここで取る
  const due = await getDue();

  return (
    <main className="app">
      <div className="body">{children}</div>
      <TabBar dueCount={due.length} />
      <NotificationBridge />
    </main>
  );
}
