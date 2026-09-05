import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `.claude/worktrees` は git が `.git/info/exclude` でこのリポジトリの外と
// 扱っている、別ブランチのチェックアウト。拾うと同じテストが二重に走り、
// ハーネスの自己テスト（リポジトリ全体に検査を掛ける）どうしが衝突する
const EXCLUDE = [
  "**/node_modules/**",
  "**/.next/**",
  "**/.open-next/**",
  "**/.claude/worktrees/**",
];

export default defineConfig({
  // `@/` は tsconfig の paths で解決しているが、vitest はそれを読まない。
  // feature をまたぐ import は絶対パスにする決まりなので（design D3）、
  // ここで同じ対応を教えておかないとテストだけが解決に失敗する。
  // project 側は `extends: true` でこれを引き継ぐ。
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",

    // **app と harness は、テスト 1 件のコストの桁が違う**（stabilize-harness-tests E1）。
    //
    // app 側は純粋な単体テストで、既定の 5 秒を超えたら本当に何かが壊れている。
    // harness 側は 1 件ごとに `spawnSync` で**リポジトリ全体の検査**を起動するので、
    // 秒単位が正常である。同じ予算を当てると、どちらかが必ず間違った予算になる。
    //
    // project を分ける目的は**予算を分けること 1 点**である。走らせる順序や
    // 並列度は変えていない（E3 として順序の制御を試したが、実測で差が出なかった）。
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: [...EXCLUDE, "scripts/harness/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "harness",
          environment: "node",
          include: ["scripts/harness/**/*.test.ts"],
          exclude: EXCLUDE,

          // 分ける前は harness 側も既定の 5 秒で走っていた。実測では無負荷で
          // 1.5 秒、フルスイート並列で 4.4〜5.6 秒、`next build` と同時なら
          // 13.4 秒である。**5 秒は、普通の負荷でも超える値だった。**
          //
          // 予算を上げても待ち時間は増えない。`spawnSync` は同期呼び出しで
          // ワーカーをブロックするので、vitest は**中断できない**（予算 5 秒の
          // テストに `sleep 15` を置くと 15,016ms ブロックしてから赤くなる）。
          // `testTimeout` は打ち切る仕組みではなく、**事後に赤くする閾値**である。
          //
          // したがってこの値が決めるのは「何秒までを緑とみなすか」だけで、
          // 13.4 秒の実測に対して桁の違う 60 秒を取る。4 倍程度だと、CI の遅い
          // ランナーや `check:types` がまた 1 段増えたときに同じ調査を繰り返す。
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
