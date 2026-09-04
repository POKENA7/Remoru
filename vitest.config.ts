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
    exclude: ["**/node_modules/**", "**/.next/**", "**/.open-next/**"],
  },
});
