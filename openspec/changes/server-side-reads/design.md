## Context

動機は proposal.md の「Why」を参照。ここでは組み替えの形を決めるのに要る事実を置く。

**いま `app-shell.tsx` が持っている状態**（`"use client"`、12KB）

| 状態 | 何のため | Route をまたぐと |
|---|---|---|
| `tab` `detailId` `detailMemo` | どの画面を出すか | 経路が代わりに持つ |
| `memos` `due` `tags` `loading` `guided` `suggestion` | 取得したデータ | Server Components が代わりに持つ |
| `activeTagId` | タグの絞り込み | 経路が代わりに持つ（`/?tag=`） |
| `draft` | 書きかけの本文 | **消える。黙って失われる** |
| `suggestionResult` | 受け取ったタグの提案 | **消える。取り直しに課金が要る** |
| `notice` `noticeAnswer` | 初回の告知と、その答え | **消える。同じ問いがもう一度出る** |
| `fresh` | 保存直後の刷りの合図 | 一覧の中で完結するので影響しない |
| `restore` | 詳細を開く前の位置と焦点 | ブラウザの復元に委ねる |
| `settingsOpen` | 通知設定を出しているか | 置き場を決める必要がある |
| `polls` | 生成中の問い合わせ回数 | 一覧の中で完結する |

`app-shell.tsx` のコメントは、この 3 つ（`draft` `suggestionResult` `notice`）が
**unmount で失われることを避けるために上へ持ち上げられた**ことを明示している。
Route を分けるとその持ち上げが効かなくなる。**この change の実質的な難所はここ**で、
データフェッチの移動そのものではない。

**すでにできていること**（前の change）

- `features/<機能>/` にデータアクセスが分離済み。Route Handler は
  「認証 → 関数呼び出し → JSON」の薄い殻
- `lib/session.ts` に `getCurrentUserId()`
- `auth-boundary` の検査が `lib/` と `features/**` の両方を走査する

**制約**

- `cron-worker` は `features/notification/*` と `features/review/review-scheduler` を
  読む。**そこに `server-only` を付けると Workers 側の import で throw する**
- OpenNext Cloudflare。Route Handler と Server Components はどちらも Workers 上で動く

## Goals / Non-Goals

**Goals:**

- 読み取りを Server Components に移し、`useEffect` からの `/api/*` を無くす
- 画面に経路を与え、`loading.tsx` / `error.tsx` の置き場を作る
- 失われては困る 3 つの状態（下書き・提案・告知）を、経路をまたいでも保つ

**Non-Goals:**

- 書き込みの Server Actions 化。次の change
- `loading.tsx` / `error.tsx` / `<Suspense>` を実際に置くこと。置き場を作るだけ
- キャッシュ。適用範囲外と決めてある
- タブ切替の体感を最適化しきること。まず作り、実測してから判断する

## Decisions

### D1: Route Group で「タブの枠」と「タブの中身」を分ける

```
app/
  layout.tsx                    ClerkProvider とフォント（いまのまま）
  (app)/
    layout.tsx                  下部タブの枠。Server Components
    page.tsx                    メモの一覧（?tag= を受ける）
    review/page.tsx             復習
    record/page.tsx             記録
    memos/[memoId]/page.tsx     メモの詳細
  sign-in/  sign-up/            いまのまま
```

`(app)` の `layout.tsx` が下部タブを持つ。タブは `<Link>` なので、
**枠は Server Components のまま**にできる。いまタブの `aria-selected` を
クライアント状態で決めているところは `usePathname()` を使う小さな
Client Components に切り出す。

`loading.tsx` `error.tsx` は `(app)/` とその下の各 Route に置ける形になるが、
**この change では置かない**（次の change）。置ける形になったことだけを担保する。

### D2: Container は Route 側、Presentational は feature 側

```
app/(app)/_containers/memo-list/{index.tsx,container.tsx}   ← 取得
features/memo/components/memo-list.tsx                       ← 表示
```

Container は「この経路に何を並べるか」というルート固有の合成なので `app/` に置く。
feature に置くと feature がページを知ることになる。Presentational は feature の
持ち物なので `features/<機能>/components/` に置く。

**採らなかった案**: 両方 feature に置く。前の change の CLAUDE.md に書いた
「機能を持つものは `features/`」に一見沿うが、Container が持つのは機能ではなく
ページの構成である。

### D3: 下書きは `sessionStorage` に逃がす

**この change で最も壊れやすいのがこれ。** 書きかけの本文を持ったまま復習タブへ
移って戻ると、いまは残るが、経路が変わると消える。黙って失われる。

`sessionStorage` に置く。利用者ごとの端末に閉じ、タブを閉じれば消えるので、
下書きの寿命として妥当。`localStorage` は端末に残り続けるので使わない。

**検査で固定する**（L06）。「本文を入力 → 別の経路へ移る → 戻る → 本文が残っている」を
検査に書き、下書きの保持を消す変更を入れて赤くなることを確かめてから採用する。
コメントで「消えないように気をつける」と書くだけでは守れない。

### D4: タグの提案結果も `sessionStorage` に置く

`suggestionResult` はモデルの呼び出し結果で、取り直しに課金が要る。だから
いまは画面の外へ持ち上げてある。経路が変わると消える。

**D3 と同じ仕組みに揃える。** 下書きと提案は性格が同じ——どちらも「まだ確定して
いない、失うと痛いもの」で、タブを閉じたら消えてよい。置き場を 2 つに分ける
理由がない。

*採らなかった案*: サーバーに保存し、承認待ちの記録として残す。経路をまたごうが
リロードしようが残るので確実だが、**テーブルの追加＝マイグレーションが要る**。
読み取りの移動を目的とするこの change に schema の変更を混ぜると、差分の性格が
2 つになる。提案の永続化そのものに価値があると分かったら、別の change で行う。

`tag-suggestion` の spec は提案の寿命について何も書いていない。`sessionStorage` なら
**いまと同じ振る舞いが保たれる**ので、この capability の delta は要らない。

### D5: 初回の告知は、出したことをサーバーに記録して判定する

`notice` と `noticeAnswer` はいま画面の外に持ち上げてある。「一度掴んだら離さない」
「答えたのに戻ってきたとき同じ問いがもう一度出る」を避けるためである。

`/api/first-run` POST がすでに「導きを終えた」ことを記録している。告知を出すか
どうかの判定は**その記録だけで決まる**ようにする。答えたかどうかは画面の中の
状態のままでよい——経路をまたいで戻ってきたとき、記録により告知そのものが
出なくなるので、答えの状態を運ぶ必要がない。

### D6: 通知設定は経路を持たない。シートとして出す

`settingsOpen` は復習タブから開く設定画面である。これに経路を与えると、
タブが 3 つという `design-decisions.md` の決定（下部タブを 3 つにした理由）と
並ぶ 4 つ目の画面が経路の上に現れる。

`sheet` capability がすでにシートの振る舞いを定めている。設定はシートとして出し、
経路を持たせない。`navigation` の spec も、経路を持つのは 4 つと限っている。

### D7: `server-only` は「D1 に触るもの」だけに付ける

対象は `lib/db.ts` と、各 feature の**データベースを触る関数を持つモジュール**。

**`cron-worker` が読む 4 本には付けない**（`features/notification/{push,
notification-timing,notification-message}.ts` と
`features/review/review-scheduler.ts`）。`server-only` は RSC の条件付き
エクスポートで解決されるため、Workers のビルドでは throw する側が選ばれる。
幸いこの 4 本はいずれも D1 バインディングに触らない純ロジックなので、付ける
必要がない。

**検査で固定する**（L06）。Client Component から `lib/db` を import する違反を
注入し、ビルドが赤くなることを確かめる。同時に、cron-worker が読む 4 本に
`server-only` が**付いていない**ことも検査する——付けた瞬間に cron が壊れ、
それは `npm run check` では出ない（前の change で `check:types` に足したので
型では出るが、`server-only` は実行時に throw するので型では出ない）。

### D8: 取得関数は `cache()` でラップし、`verifySession()` をその中で呼ぶ

Container を分けるとデータフェッチがコロケーションされ、同じ取得が複数回
走りうる。React の `cache()` でリクエスト内メモ化する。

認可はデータフェッチ層に置く。`lib/session.ts` に `verifySession()` を足し、
未認証なら `/sign-in` へ送る。各 `page.tsx` でも呼ぶが、**取得関数の中でも呼ぶ**——
呼び忘れた `page.tsx` があっても、データが出ない側に倒れる。

`getCurrentUserId()` は残す。`verifySession()` はその上に「無ければ止める」を
足したもの。

### D9: 書き込み後の再取得は `router.refresh()`

この change では書き込みを触らない。いま `onChanged()` が `/api/*` を叩き直して
いるところを `router.refresh()` に置き換える。Server Components が再実行され、
新しい RSC Payload が届く。

次の change で Server Actions にしたとき、これは `revalidatePath()` に置き換わる。
**つまり `router.refresh()` は途中の形である**。そうと分かる場所にコメントを残す。

### D10: 位置と焦点の復元はブラウザに委ねる。ただし確かめる

いまは `restore.current` に `scrollY` とメモの id を控え、戻ったときに
`focus({ preventScroll: true })` してから `scrollTo` している。
Route を分ければ Next.js のスクロール復元が効く。

**ただし焦点の復元は自動では起きない。** `sheet` capability の
「閉じたあと焦点を戻す」と同じ問題が一覧にもある。実機で確かめ、
効かなければ `memos/[memoId]` から戻ったときの焦点付けを明示的に残す。

## Risks / Trade-offs

- **下書きが黙って失われる** → D3 で `sessionStorage` に逃がし、検査で固定する。
  この change で最も壊れやすい

- **タブ切替が遅くなる** → `<Link>` の prefetch で緩和する。実測してから判断する
  （Open Questions）。耐えられなければ、該当タブの中身だけクライアント保持へ戻す
  という退路がある。**経路を戻す必要はない**

- **`app/` のほぼ全域を触る差分になる** → feature ごとではなく**経路ごと**に
  刻む。`(app)/layout.tsx` と枠 → 一覧 → 詳細 → 復習 → 記録の順。各段で
  `npm run check` を通す

- **`.tsx` にテストが 1 本も無い状態で大きく書き換える** → Container/Presentational に
  分けると Presentational にテストが当たるようになるが、それは分けた**後**にしか
  効かない。書き換えの最中は、既存の純関数テスト（`cells.ts` `detail-selection.ts`
  など）と spec のシナリオを画面上で辿ること（L05）が頼りになる

- **実機でしか分からないことがある**（L10）→ iOS のスワイプバック、通知からの
  復帰、焦点の復元は、ブラウザ枠では確認できない。**確認できていない範囲を明示して
  実機に委ねる**

## Migration Plan

デプロイの手順は無い。経路が変わるので、**古い経路を開いているブラウザは
リロードで新しい経路へ移る**。永続化された状態の移行も無い。

ロールバックは revert。ただし `sessionStorage` に書いた下書きは残るので、
戻したときに読まれないだけで害はない。

## Open Questions

- **タブ切替の体感。** Cloudflare Workers + D1 で `<Link>` の prefetch がどれだけ
  効くか。実装後に実機で測る。ここだけは文でも設計でも決まらない
- **焦点の復元が Next.js のスクロール復元だけで足りるか**（D10）。実機で確かめる
