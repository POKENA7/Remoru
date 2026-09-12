# Next.js の考え方に沿った組み替えと、初期表示の改善 — 作業計画

2026-09-12 作成。『Next.jsの考え方』（https://zenn.dev/akfm/books/nextjs-basic-principle）
に沿ってアーキテクチャを組み替え、サイトが開かれるまでの速度を改善するための見取り図。

**この文書は指揮者の成果物であり、コードではない。** 個々の作業は `openspec/changes/` の
change に分けてあり、それぞれ proposal / design / tasks（と必要な spec の delta）を持つ。
実装するセッションは **この表の順序を守り、change の design を読んでから `/opsx:apply` する**。
この文書を書き換えるのは、change が終わって表の状態を更新するときと、順序や方針を変えるとき。

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

```
A（土台。互いに独立。並列可。どれも小さい）
  A1 measure-first-paint          物差し。手順・基準値・check:build / check:bundle
  A2 add-staging-environment      staging。エージェントは staging まで、本番は CI
  A3 add-e2e-smoke                Playwright 1 本。app/ を書き換える間の安全網
  A4 enforce-layer-boundaries     層の向きの構造検査
  A5 review-with-change-context   作業中の change の宣言、レビューに tasks/spec を渡す

B（本の適用。この順。B2 だけは B1 と並列可）
  B1 server-side-reads            読み取りを Server Components へ。経路を分ける      ← 進行中（1 章まで済）
  B2 lighten-first-paint          フォントの自前配信、Clerk の Provider を絞る
  B3 stream-route-boundaries      loading / Suspense / error。B1 と同時に本番へ
  B4 write-with-server-actions    書き込みを Server Actions へ。app/api を空に
  B5 move-client-boundary-to-leaves  "use client" を葉へ
```

| # | change | 前提 | 本の章 | 状態 |
|---|---|---|---|---|
| A1 | `measure-first-paint` | なし | — | 未着手 |
| A2 | `add-staging-environment` | なし | — | 未着手 |
| A3 | `add-e2e-smoke` | なし | — | 未着手 |
| A4 | `enforce-layer-boundaries` | A1 の `check:build`（無ければ自分で足す） | — | 未着手 |
| A5 | `review-with-change-context` | なし | — | 未着手 |
| B1 | `server-side-reads` | A1 A2 A3 A5 | 3 4 5 6 14 15 31 | 1 章まで済。2〜6 章が残り |
| B2 | `lighten-first-paint` | A1（A2 があると測りやすい） | — | 未着手 |
| B3 | `stream-route-boundaries` | B1（2〜4 章）, A1 | 28 32 | 未着手 |
| B4 | `write-with-server-actions` | B1 B3 A4 | 9 20 27 | 未着手 |
| B5 | `move-client-boundary-to-leaves` | B1 B3 B4 | 11 12 13 | 未着手 |

**本番投入の規則:** B1 は staging 止まり。B1 と B3 を同じ日に続けて `main` へ merge する
（B1 単独ではタブ切替が確実に悪化する。B3 design D6）。

**並列で進めるなら:** A1〜A5 を別 worktree で同時に。B1 と B2 も同時にできる（触る場所が重ならない）。
それ以外は直列。

---

## 2. 現状（2026-09-12 に実測）

### 2.1 構造

| 事実 | 根拠 |
|---|---|
| ルートは `/` 1 本。`app/page.tsx` は認証確認だけして `<AppShell>` を返す | `app/page.tsx` |
| `app/` の `.tsx` 10 本すべてが `"use client"`。画面ツリー全体がクライアントバンドル | `grep '"use client"' app/*.tsx` |
| データは `useEffect` から `/api/*` を 4 本並列で叩く。初期表示までに **HTML → JS → hydrate → API 4 本 → 描画** の最短 3 往復 | `app/app-shell.tsx` の `load()` |
| `loading.tsx` `error.tsx` `<Suspense>` `<Link>` `next/font` はどこにも無い | `grep -rn` で 0 件 |
| フォントは Google Fonts を `<link rel="stylesheet">` で読む（別オリジン 2 つ、描画をブロック） | `app/layout.tsx` |
| `ClerkProvider` がルート layout で全ページを包み、`clerk-js` を CDN から読む。アプリ画面で使う Clerk の部品は `UserButton` 1 つ | `app/layout.tsx` `app/memo-tab.tsx` |
| `middleware.ts` は Next 16 で非推奨。`proxy.ts` は OpenNext が支援せず移行できない | `docs/open-issues.md` 2 |
| 読み取りの入口 `features/*/queries.ts`（`server-only` + `cache()` + `verifySession()`）は**できている** | B1 の 1.1〜1.6 |

### 2.2 計測

本番 `https://remoru.pokena191.workers.dev` に対して curl で 3 回ずつ。
**サインイン済みの `/` は Cookie が要るため測れていない**（A1 で測る）。

| 対象 | 実測 |
|---|---|
| `/` 未サインイン（307）TTFB | 0.53 / 0.53 / 0.99 秒 |
| `/sign-in` TTFB | 0.07 / 0.48 / 0.53 秒（ばらつきが大きい。コールドスタートの疑い） |
| 自前 JS（11 チャンク、gzip 合計） | 224 KB |
| `clerk.browser.js`（gzip） | 81 KB（全ページで読む） |
| `@clerk/ui`（gzip） | 44 KB（preload される） |
| Google Fonts の CSS（gzip、iPhone UA） | 87 KB。日本語フォントは unicode-range で細切れになるため大きい。**描画ブロック** |
| 自前 CSS（gzip） | 4 KB |
| `npm run test`（Stop hook が走らせるもの） | 47 ファイル 558 件、9.6 秒 |
| `next build` | 2 秒台（Turbopack） |

### 2.3 本の章と現状の対応

| 章 | 現状 | 担当 |
|---|---|---|
| 3 データフェッチ on Server Components | ✗ 全部 `useEffect` | B1 |
| 4 コロケーション | ✗ `app-shell` が一括取得して props で配る | B1 |
| 5 Request Memoization | △ `cache()` は付けたが、効いているかは未確認（B1 の 3.1） | B1 |
| 6 並行データフェッチ | △ `Promise.all` は API 側にある。Container に分けたときに直列化しないよう見る | B1 |
| 7 N+1 と DataLoader | ✓ `getTagsForMemos` `getReviewStates` がまとめ取り | — |
| 8 細粒度の REST API | 該当なし（外部 API を叩かない。D1 直読み） | — |
| 9 ユーザー操作とデータフェッチ | ✗ 書き込み後に全件 `load()` | B1（`router.refresh()`）→ B4 |
| 11 バンドル境界 / 12 Client の用途 / 13 Composition | ✗ 境界が根元にある | B5 |
| 14 ツリーに分解 / 15 Container/Presentational | ✗ | B1 |
| 17〜19 キャッシュ | 全画面が利用者固有なので**当面は適用しない**。`staleTimes` は B3 で実測して判断 | 保留 |
| 20 Server Actions | ✗ Route Handler + 手書き `fetch` | B4 |
| 22〜25 Cache Components | 未着手。B3 で目標に届かないときの次の手 | 保留 |
| 27 Server Components の純粋性 | △ 「いま」は `lib/request-clock.ts` に寄せた | B1・B4 |
| 28 Suspense と Streaming | ✗ | B3 |
| 30 リクエストの参照 | ✓ `verifySession()` が `auth()` を一か所で読む | — |
| 31 認証と認可 | ✓ `queries.ts` がデータフェッチ層で `verifySession()` | — |
| 32 エラーハンドリング | ✗ `error.tsx` `not-found.tsx` が無い | B3 |

---

## 3. 到達点

```
app/(app)/layout.tsx           下部タブの枠。Server Components。<Link>。verifySession() を 1 回
app/(app)/<経路>/page.tsx      Container の合成だけ。loading.tsx / error.tsx を隣に置く
app/(app)/_containers/…        Container。queries を呼び、Presentational に渡す
features/<機能>/queries.ts     読み取りの入口。server-only + cache() + verifySession()   ← 済
features/<機能>/actions.ts     書き込みの入口。"use server" + verifySession() + revalidatePath()   ← B4
features/<機能>/components/    Presentational。操作を持つ葉だけ *-client.tsx                     ← B5
features/<機能>/<機能>.ts      ドメイン。(db, userId, …) の純関数。いまのまま
lib/db.ts lib/session.ts       横断。server-only
app/api/                       空                                                            ← B4
```

層の向きは `enforce-layer-boundaries` の 5 つの規則（A4 の後は `lib/layer-boundary.test.ts` が正）。

初期表示の目標像: 枠と骨格が先に描かれ、一覧は HTML に入って届く。JS を待たずに読める。

---

## 4. 全 change に共通する方針

1. **1 change = 1 経路、または本の 1 部。** スキーマ変更を混ぜない
2. **速度の主張は `docs/perf.md`（A1）の手順で前後を測る。** 5 回、中央値と最大値。差がばらつきに埋もれたら**入れない**（L13）
3. **ドメイン関数は純粋なまま。** 認証・D1・時計・`revalidatePath` は `queries.ts` / `actions.ts` に閉じる。構造の検査で固定する（L06）
4. **見た目・動きの選択肢はモックで出す**（L11）。骨格（B3）、楽観的な行（B4）、`/account`（B2）が対象
5. **実機でしか分からないものは、確認できていないと明示して staging で委ねる**（L10）。iOS のスワイプバック・PWA の通知復帰・FOUT
6. **Next 16 の API を書く前に `node_modules/next/dist/docs` を読む**（CLAUDE.md）。`cache()` `revalidatePath` `staleTimes` `loading.js` の prefetch への影響は版で変わっている
7. **Route Handler や古い経路を残したまま新しいものを足さない。** 段ごとに消す（B4 D5）。両方あると、どちらが使われているか分からなくなる

---

## 5. 保留（着手しない。理由を残す）

| 項目 | 理由 | 再検討の契機 |
|---|---|---|
| Cache Components / 静的シェル（第 3.1 部） | 全画面が利用者固有。OpenNext Cloudflare での対応状況を確認していない | B3 の実測で「一覧が読めるまで 1 秒」に届かないとき |
| `middleware.ts` → `proxy.ts` | OpenNext が Node.js ランタイムの middleware を支援しない | `docs/open-issues.md` 2 |
| Service Worker でのシェルのキャッシュ | add-auth-and-deploy D7「何もしない SW はキャッシュだけ変えて不具合の温床になる」を尊重 | B2・B3 で足りないとき |
| サインイン画面の自前化 | Provider を絞れば Clerk の UI はサインイン画面に残り、「現状相当の見た目」は満たされる | サインイン画面そのものを速くしたくなったとき |
| `.learnings/active.md` の棚卸 | 13 件で閾値（12）超え。**A の change を始める前に一度行う**（手順は `.learnings/archive.md` 冒頭）。change ではなく作業 | いま |

---

## 6. 変更履歴

- 2026-09-12 作成。利用者の判断を反映し、10 件の change を `openspec/changes/` に立てた
