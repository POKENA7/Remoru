## Context

- `app/layout.tsx` が `<link rel="stylesheet">` で Google Fonts を読み、`ClerkProvider` で全体を包む
- アプリ画面で Clerk のクライアント部品を使っているのは `app/memo-tab.tsx` の `UserButton` **だけ**
  （`grep -rn "@clerk" app/*.tsx`）。`app/page.tsx` の認証は `auth()`（サーバー）
- `@clerk/nextjs` v7 の `ClerkProvider` の props に `clerkJSVariant`（headless）は**無い**
  （`grep -rho "clerkJSVariant" node_modules/@clerk/` が 0 件）。あるのは `clerkJSUrl` と `dynamic`。
  つまり「Provider を残したまま JS を軽くする」手は無く、**Provider の範囲を絞る**しかない
- `middleware.ts` の `clerkMiddleware()` は残す。`auth()` の前提であり、Provider とは無関係
- `globals.css` の `font-family` は `"Zen Kaku Gothic New", system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`
- `docs/design-decisions.md` に `UserButton` の置き場を決めた記述があるか、実装時に確かめる

## Goals / Non-Goals

**Goals:**

- アプリ画面から Clerk の 125 KB と Google Fonts の 87 KB（描画ブロック）を外す
- 見た目と振る舞いは変えない

**Non-Goals:**

- サインイン画面の自前化（proposal 参照）

## Decisions

### D1: フォントは `next/font/google`。ウェイトは 400 / 500 / 700 のまま

```ts
const zen = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], display: "swap", variable: "--font-zen" });
```

日本語フォントは `subsets` で日本語を指定できない（Google Fonts 側が unicode-range で分割する）。
`next/font` はその分割された `@font-face` を**ビルド時に取り込み、自前の origin から配る**。
CSS の量そのものは減らないが、別オリジンへの接続と描画ブロックが消える。**減るのは接続と
ブロック、減らないのは CSS の量**——この区別を測って記録する。

`globals.css` の `font-family` は `var(--font-zen), system-ui, …` にし、フォールバックは変えない。

**FOUT の見え方は実機で確かめる**（L10）。`display: "swap"` はいまと同じ。

### D2: `ClerkProvider` は `app/(auth)/layout.tsx` へ。アプリ画面は Provider なし

```
app/layout.tsx              html/body・フォント・globals.css。Provider なし
app/(auth)/layout.tsx       ClerkProvider。sign-in / sign-up / account を包む
app/(auth)/sign-in/…        いまのまま（移動のみ）
app/(auth)/sign-up/…        同上
app/(auth)/account/page.tsx UserButton（または UserProfile）。サインアウトの経路
app/page.tsx ほか           Provider なし。auth() で確認するだけ
```

`UserButton` は `/account` へ移し、いま `UserButton` がある場所には同じ見た目のリンク
（アバターの丸。Clerk の画像 URL は `auth()` から取れる `currentUser()` で得る。**`currentUser()` は
Clerk の API を呼ぶので、画面ごとに呼ばない**——`server-side-reads` の `cache()` と同じ扱いで
`lib/session.ts` に 1 つ置く）。押すと `/account` に飛び、そこで Clerk の UI が出る。
**1 回の遷移が増える**代わりに、アプリ画面から 125 KB が消える。

**要検証**: `auth()` が `ClerkProvider` 無しで動くこと（動くはず。Provider はクライアント側の
文脈で、`auth()` は middleware の文脈を読む）。`next dev` で `/` を開いて確かめる。

*採らなかった案*: `UserButton` をアプリ画面に残し、`dynamic` を切る。Provider がある限り
`clerk-js` は読まれる。効かない。

### D3: 効果は 2 段で測る。段ごとに入れるか決める

1. フォントだけ変えて測る（`docs/perf.md` の手順、5 回）
2. Provider を絞って測る

**どちらも、中央値の差がばらつきを超えなければ入れない**（L13）。フォントは効く見込みが高い
（描画ブロックの解消）。Provider は「一覧が読めるまで」に効くかは JS の実行順次第で、測るまで分からない。
効かなかった段は revert し、design に「効かなかった」と数値つきで書く。

### D4: `/sign-in` の TTFB のばらつきは切り分けるだけ。直さない

`wrangler tail` でリクエストごとの所要を取り、Workers の起動（コールド）か Clerk の middleware の
往復かを見る。原因が Workers の起動なら、アプリ側でできることは無い。記録して終える。

## Risks / Trade-offs

- **`UserButton` を移すと、design-decisions で決めた画面の一覧と食い違う** → 実装時に
  `docs/design-decisions.md` を読み、`/account` の追加を 3 行で追記する。画面が増えるので
  **見た目のモックを 1 つ出して確認を取る**（L11。アバターの丸 → 飛んだ先の画面）
- **`next/font` の取り込みがビルド時に Google へ接続する** → CI で `next build` が走る
  （`measure-first-paint` の `check:build`）。CI からの接続が失敗するとビルドが落ちる。
  失敗したら `next/font/local` にフォントファイルを置く形へ切り替える（ライセンスは SIL OFL）

## Open Questions

- `currentUser()` の画像 URL を取るために Clerk の API を毎リクエスト叩くのは避けたい。
  `auth()` の `sessionClaims` に画像が入るよう Clerk のセッショントークンをカスタマイズできるか
  （ダッシュボードの設定）。できなければ、アバターではなく固定のアイコンにする
