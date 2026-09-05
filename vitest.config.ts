import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` は tsconfig の paths で解決しているが、vitest はそれを読まない。
  // feature をまたぐ import は絶対パスにする決まりなので（design D3）、
  // ここで同じ対応を教えておかないとテストだけが解決に失敗する。
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // `.claude/worktrees` は git が `.git/info/exclude` でこのリポジトリの外と
    // 扱っている、別ブランチのチェックアウト。拾うと同じテストが二重に走り、
    // ハーネスの自己テスト（リポジトリ全体に検査を掛ける）どうしが衝突する
    exclude: ["**/node_modules/**", "**/.next/**", "**/.open-next/**", "**/.claude/worktrees/**"],
  },
});
