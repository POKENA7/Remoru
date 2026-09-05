## Why

`scripts/harness/*.test.ts` は「検査に違反を注入すると赤くなる」ことを見るテスト
（design D10 / L06 の昇格先）である。これが**負荷次第で落ちる**。落ちたときに
分かるのは「検査が壊れた」ではなく「機械が忙しかった」だけで、**赤の意味が
読めない検査**になっている。断続的に赤くなる門は、いずれ外される（制約 4）。

実測（このリポジトリ、8 コアの macOS）:

| 走らせ方 | `check:types` の注入テスト | 結果 |
|---|---|---|
| `vitest run scripts/harness` だけ | 1,561ms | 緑 |
| フルスイート（47 ファイル並列）4 回 | 4,440 / 4,760 / 5,291 / 5,623ms | **2 回赤** |
| フルスイート + `next build` 同時 | 7,851ms | **赤** |

既定の `testTimeout` は 5,000ms である。**単独で走らせても予算の 3 割を使い切る
テストに、5 秒を割り当てていた**のが欠陥である。これらのテストは 1 件につき
リポジトリ全体の検査を 2 回（注入した状態と、取り除いた状態）起動する。
`check:types` は 2026-09-04 の change で `tsc --noEmit && npm --prefix cron-worker
run typecheck` の 2 段になり、実コストがさらに伸びた。

負荷が加わる経路は普段の作業に埋まっている。門（PreToolUse / Stop）は
`check:test` を走らせるので、**vitest の中から vitest が走る**場面が実際にある。
CI でも同じことが起きうる。

## What Changes

- **vitest を `app` / `harness` の 2 つの project に分ける。** `harness` は
  `scripts/harness/**/*.test.ts` だけを持ち、`app` は残り全部を持つ
- **`harness` project の `testTimeout` / `hookTimeout` を実測に見合う値に上げる。**
  既定の 5,000ms は、この種のテストの実コストに対して最初から足りていない
- ~~`sequence.groupOrder` で `harness` を `app` の後に走らせる~~ —— **実装中に
  同一条件で測り直したら差が出なかったので取りやめた**（design E3）。最初に見えた
  改善は、設定の差ではなくマシン負荷の差だった
- **注入用の一時ファイルの置き場を、プロセスごとに分ける。** 現在の `afterEach` は
  `harness-tmp/` を丸ごと消すので、同時に走っている別の vitest の注入ファイルを
  消してしまう
- 検査が検査であること（違反を注入すると赤くなる）は**一切変えない**。
  assert の中身も、一時ファイルをリポジトリ内に置くことも、置き場の名前に
  ドットを付けないことも、そのまま保つ

**BREAKING なし。** 利用者から見える振る舞いは変わらない。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。検査の走らせ方だけを変えるので、`skip_specs: true` とする
（`add-deterministic-harness` / `feature-directories` と同じ扱い）。

## Impact

- `vitest.config.ts` — `projects` を導入する
- `scripts/harness/checks.test.ts` — 一時ファイルの置き場をプロセスごとに分ける
- `.github/workflows/ci.yml` — 変更しない見込み。`npm run check` を呼ぶだけの形は保つ
- `npm run test` / `npm run check:test` / 門（`stop-gate.sh` / `precommit-gate.sh`）が
  呼ぶ経路 — 走る対象と件数は変えない（558 件のまま）
