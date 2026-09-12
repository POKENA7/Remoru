# Next.js の考え方に沿った組み替えと、初期表示の改善 — 作業計画

2026-09-12 作成。『Next.jsの考え方』（https://zenn.dev/akfm/books/nextjs-basic-principle）
に沿ってアーキテクチャを組み替え、サイトが開かれるまでの速度を改善するための見取り図。

**この文書は指揮者の成果物であり、コードではない。** 個々の作業は `openspec/changes/` の
change に分けてあり、それぞれ proposal / design / tasks（と必要な spec の delta）を持つ。
実装するセッションは **まず `git fetch origin` で main との差を見て（L14）、この表の順序を守り、
change の design を読んでから `/opsx:apply` する**。この文書を書き換えるのは、change が終わって
表の状態を更新するときと、順序や方針を変えるとき。

---

## 0. 利用者の判断（2026-09-12）

| 問い | 答え |
|---|---|
| 初期表示の目標値 | 一覧が読めるまで **1 秒**（`performance` spec）。タブ切替は**現状と同等**（悪化させない） |
| Clerk の UI | 使わなくてよいが、現状相当の見た目は要る。→ Provider をサインイン系の経路に絞れば、Clerk の UI はそこに残る。自前化は不要 |
| E2E 用の Clerk テスト利用者 | 作ってよい |
| staging | 作ってよい |

---

## 1. change の列と順序

**すでに済んでいるもの**（archive 済み。この計画より先に main で進んでいた）

| change | 本の章 | 何が済んだか |
|---|---|---|
| `server-side-reads`（2026-09-05） | 3 4 5 6 14 15 31 | 経路の分割、Container、`queries.ts`、`navigation` spec、`not-found.tsx` |
| `component-directories`（2026-09-05） | — | `features/*/components/`、`tests/architecture/`（層の向き 2 規則） |
| `server-actions-for-writes`（2026-09-12） | 9 20 27 32 | `actions.ts`、`refresh()`、`app/api` の削除、失敗を戻り値で |

```
A（土台。互いに独立。並列可。どれも小さい）
  A1 measure-first-paint          物差し。手順・基準値・check:build / check:bundle
  A2 add-staging-environment      staging。エージェントは staging まで、本番は CI
  A3 add-e2e-smoke                Playwright 1 本。部品を割る間の安全網
  A4 enforce-layer-boundaries     層の向きの検査に 3 規則を足す。check:build
  A5 review-with-change-context   作業中の change の宣言、レビューに tasks/spec を渡す

B（本の適用。この順。B1 と B2 は並列可）
  B1 lighten-first-paint          フォントの自前配信、Clerk の Provider を絞る
  B2 stream-route-boundaries      loading / Suspense / error。Container の「途中の形」を終える
  B3 move-client-boundary-to-leaves  "use client" を葉へ
  B4 optimistic-memo-save         保存を楽観的に（任意・最後）
```

| # | change | 前提 | 本の章 | 状態 |
|---|---|---|---|---|
| A1 | `measure-first-paint` | なし | — | **実装中。** 検査（`check:build` `check:bundle`）と手順書は済み。時間の計測は Clerk のテスト利用者待ち |
| A2 | `add-staging-environment` | なし | — | 未着手 |
| A3 | `add-e2e-smoke` | なし | — | 未着手 |
| A4 | `enforce-layer-boundaries` | A1 の `check:build`（無ければ自分で足す） | — | 未着手 |
| A5 | `review-with-change-context` | なし | — | 未着手 |
| B1 | `lighten-first-paint` | A1（A2 があると測りやすい） | — | 未着手 |
| B2 | `stream-route-boundaries` | A1 A3 | 28 32 | 未着手 |
| B3 | `move-client-boundary-to-leaves` | B2 A3 A4 | 11 12 13 | 未着手 |
| B4 | `optimistic-memo-save` | B2 B3 | 9 | 未着手。任意 |

**並列で進めるなら:** A1〜A5 を別 worktree で同時に（`scripts/spawn-change.sh <change>` が herdr の worktree を作り、依存を入れ、Claude Code にプロンプトを渡す。**main の checkout から**打つ。`--dry-run` で内容を確かめられる）。B1 と B2 も同時にできる（触る場所が重ならない）。
それ以外は直列。merge の順は A5 → A1 → A4 → A3 → A2（A5 が全員の使う review.sh を変え、A4 が A1 の
`check:build` に依存する）。

---

## 2. 現状（2026-09-12、main `f3f78d3`）

### 2.1 構造

| 事実 | 根拠 |
|---|---|
| 経路は `/` `/review` `/record` `/memos/[memoId]`。`(app)/layout.tsx` が `verifySession()` と `getDue()` を持つ | `app/(app)/` |
| 読み取りは Container → `features/*/queries.ts`（`server-only` + `cache()` + `verifySession()`） | `app/(app)/_containers/` |
| 書き込みは `features/*/actions.ts`（`"use server"` + `verifySession()` + `refresh()`）。`app/api` は無い | `server-actions-for-writes` |
| `"use client"` は 13 ファイル（`record-tab.tsx` だけ Server Component）。Container の直下から下がほぼクライアント。`memo-detail.tsx` 17 KB | `grep` |
| `loading.tsx` `error.tsx` `<Suspense>` は 0 件。Container 3 つが `try/catch` で空の画面を返す「途中の形」 | 各 Container のコメント |
| dynamic な経路に `loading.js` が無いので、タブの `<Link>` は **prefetch されていない** | Next 16 `prefetching.md` 31 行 |
| フォントは Google Fonts を `<link rel="stylesheet">` で読む（別オリジン 2 つ、描画をブロック） | `app/layout.tsx` |
| `ClerkProvider` がルート layout で全ページを包む。アプリ画面で使う Clerk の部品は `UserButton` 1 つ | `app/layout.tsx` `features/memo/components/memo-tab.tsx` |
| 層の検査: `tests/architecture/layers.arch.test.ts`（2 規則）、`auth.arch.test.ts`（actions の形）、`query.arch.test.ts` | `tests/architecture/` |
| `middleware.ts` は Next 16 で非推奨。`proxy.ts` は OpenNext が支援せず移行できない | `docs/open-issues.md` 4 |

### 2.2 計測

本番 `https://remoru.pokena191.workers.dev` に対して curl で 3 回ずつ（2026-09-12）。
**サインイン済みの `/` は Cookie が要るため測れていない**（A1 で測る）。

| 対象 | 実測 |
|---|---|
| `/` 未サインイン（307）TTFB | 0.53 / 0.53 / 0.99 秒 |
| `/sign-in` TTFB | 0.07 / 0.48 / 0.53 秒（ばらつきが大きい。コールドスタートの疑い） |
| ~~自前 JS（11 チャンク、gzip 合計）~~ | ~~224 KB~~ **← `/sign-in` の値だった。下記参照** |
| `clerk.browser.js`（gzip） | 81 KB（全ページで読む） |
| `@clerk/ui`（gzip） | 44 KB（preload される） |
| Google Fonts の CSS（gzip、iPhone UA） | 87 KB。日本語フォントは unicode-range で細切れになるため大きい。**描画ブロック** |
| 自前 CSS（gzip） | 4 KB |
| `next build` のチャンク合計（raw、4 経路ぶん） | 827.7 KB / 17 チャンク（`server-actions-for-writes` 実測） |

**この表の「自前 JS 224 KB」は `/` の値ではなかった**（A1 の実装で 2026-09-12 に判明）。
本番の HTML を取って数え直したところ、224 KB は **`/sign-in` の 11 チャンク**
（実取得の合計 223,559 B）で、しかも `<script noModule>` が付いた polyfill 38.6 KB を
含んでいた。**現代のブラウザはこれを読まない。**

| 対象 | 実測（2026-09-12） |
|---|---|
| **`/` の自前 JS（13 チャンク、gzip、polyfill を除く）** | **206.2 KB**（206,221 B） |
| `/sign-in` の自前 JS（11 チャンク、gzip、polyfill 込み） | 223.6 KB（223,559 B） |
| うち polyfill（`noModule`。読まれない） | 38.6 KB |

以後は `npm run check:bundle` が `/` の値を出し、予算（216,533 B）を超えると
コミットできない。測り方は [docs/perf.md](perf.md)。
| `npm run test`（Stop hook が走らせるもの） | 47 ファイル 558 件、9.6 秒 |
| `next build` | 2 秒台（Turbopack） |

### 2.3 本の章と現状の対応

| 章 | 現状 | 担当 |
|---|---|---|
| 3 データフェッチ on Server Components | ✓ Container + `queries.ts` | 済 |
| 4 コロケーション | ✓ | 済 |
| 5 Request Memoization | ✓ `cache()`。実行で確かめた（`server-side-reads` 3.1） | 済 |
| 6 並行データフェッチ | ✓ Container の `Promise.all` | 済 |
| 7 N+1 と DataLoader | ✓ まとめ取り | 済 |
| 8 細粒度の REST API | 該当なし | — |
| 9 ユーザー操作とデータフェッチ | △ Server Actions + `refresh()`。楽観的更新は無い | B4（任意） |
| 11 バンドル境界 / 12 Client の用途 / 13 Composition | ✗ 境界が Container の直下。13 ファイル | B3 |
| 14 ツリーに分解 / 15 Container/Presentational | ✓ | 済 |
| 17〜19 キャッシュ | 全画面が利用者固有。`refresh()` を選び Router Cache は捨てない。`staleTimes` は B2 で実測して判断 | 保留 |
| 20 Server Actions | ✓ | 済 |
| 22〜25 Cache Components | 未着手。B2 で目標に届かないときの次の手 | 保留 |
| 27 Server Components の純粋性 | ✓ `lib/request-clock.ts` | 済 |
| 28 Suspense と Streaming | ✗ | B2 |
| 30 リクエストの参照 | ✓ `verifySession()` | 済 |
| 31 認証と認可 | ✓ `queries.ts` / `actions.ts` | 済 |
| 32 エラーハンドリング | △ Action は戻り値で。取得の失敗は `error.tsx` が無く空の画面 | B2 |

---

## 3. 到達点

```
app/(app)/layout.tsx           下部タブの枠。verifySession() だけ。バッジは Suspense の中      ← B2
app/(app)/<経路>/page.tsx      Container の合成だけ。loading.tsx / error.tsx を隣に          ← B2
app/(app)/_containers/…        Container。queries を呼び、Presentational に渡す               ✓
features/<機能>/queries.ts     読み取りの入口。server-only + cache() + verifySession()       ✓
features/<機能>/actions.ts     書き込みの入口。"use server" + verifySession() + refresh()     ✓
features/<機能>/components/    Presentational。操作を持つ葉だけ *-client.tsx                   ← B3
features/<機能>/<機能>.ts      ドメイン。(db, userId, …) の純関数                              ✓
lib/                           外部ライブラリのラッパーだけ                                    ✓
app/api/                       無い                                                            ✓
```

層の向きは `tests/architecture/layers.arch.test.ts`（A4 の後は 5 規則）。

初期表示の目標像: 枠と骨格が先に描かれ、一覧は HTML に入って届く。JS を待たずに読める。

---

## 4. 全 change に共通する方針

1. **始める前に `git fetch origin && git log --oneline HEAD..origin/main`**（L14）。worktree は作った日で止まっている
2. **1 change = 1 経路、または本の 1 部。** スキーマ変更を混ぜない
3. **速度の主張は `docs/perf.md`（A1）の手順で前後を測る。** 5 回、中央値と最大値。差がばらつきに埋もれたら**入れない**（L13）
4. **ドメイン関数は純粋なまま。** 認証・D1・時計・`refresh()` は `queries.ts` / `actions.ts` に閉じる。構造の検査で固定する（L06）
5. **見た目・動きの選択肢はモックで出す**（L11）。骨格（B2）、`/account`（B1）、楽観的な行（B4）が対象
6. **実機でしか分からないものは、確認できていないと明示して staging で委ねる**（L10）
7. **Next 16 の API を書く前に `node_modules/next/dist/docs` を読む**（CLAUDE.md）。`loading.js` の prefetch への影響、`staleTimes`、`refresh()` は版で変わっている
8. **古い形を残したまま新しいものを足さない。** 「途中の形」のコメントは、終える change が消す

---

## 5. 保留（着手しない。理由を残す）

| 項目 | 理由 | 再検討の契機 |
|---|---|---|
| Cache Components / 静的シェル（第 3.1 部） | 全画面が利用者固有。OpenNext Cloudflare での対応状況を確認していない | B2 の実測で「一覧が読めるまで 1 秒」に届かないとき |
| `middleware.ts` → `proxy.ts` | OpenNext が Node.js ランタイムの middleware を支援しない | `docs/open-issues.md` 4 |
| Service Worker でのシェルのキャッシュ | add-auth-and-deploy D7「何もしない SW はキャッシュだけ変えて不具合の温床になる」を尊重 | B1・B2 で足りないとき |
| サインイン画面の自前化 | Provider を絞れば Clerk の UI はサインイン画面に残り、「現状相当の見た目」は満たされる | サインイン画面そのものを速くしたくなったとき |

---

## 6. 変更履歴

- 2026-09-12 作成。利用者の判断を反映し、10 件の change を立てた
- 2026-09-12 改訂。1 週間古い worktree の上で書いていたことが merge 時に判明（L14）。
  `server-side-reads` と `server-actions-for-writes` は main で archive 済みだったため、
  `write-with-server-actions` を `optimistic-memo-save` に縮め、`enforce-layer-boundaries` を
  既存の `layers.arch.test.ts` の拡張に直し、各 change の前提を main の実態に合わせた。change は 10 件から 9 件になった
