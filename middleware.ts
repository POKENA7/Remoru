import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk の認証文脈を用意するためだけの middleware。
 *
 * **`proxy.ts` ではなく `middleware.ts` である必要がある。** Next.js 16 は
 * proxy を Node.js ランタイム固定にしており（設定不可）、OpenNext は
 * Node.js ランタイムの middleware を支援していないためビルドが通らない。
 * 一方 middleware は Edge で動き、両者の条件を満たす。
 *
 * **保護そのものはここで行わない。** Clerk は createRouteMatcher を
 * 非推奨にし、「middleware のパス一致は Next.js のルーティングと乖離しうる
 * ため、保護されるべき資源に到達できる場合がある」と警告している。
 * 未認証の遮断は資源の側で行う:
 *   - 画面      app/page.tsx がサーバー側で確認して /sign-in へ送る
 *   - API ルート 各自が getCurrentUserId() を確認して 401 を返す
 * ここは auth() が動くための土台にすぎない。
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
