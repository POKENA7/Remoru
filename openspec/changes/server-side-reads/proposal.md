## Why

いまの Remoru は Next.js の中に置かれた SPA である。ルートは `/` 1 本、その直下の
`app/app-shell.tsx` が `"use client"` で、画面のツリー全体がクライアントバンドルに
入る。データは `useEffect` から `/api/*` を 4 本まとめて叩いて取り、`memos` `due`
`tags` `loading` を props で全タブへ配っている。

これは『Next.jsの考え方』第1部・第2部が名指しで避けよと言う形そのものである。
第3章「データフェッチは Server Components で」、第4章「データフェッチのコロケーション」、
第14・15章「Container/Presentational」のいずれも、1 か所も適用されていない。

同時に、**画面が URL を持っていない**ことが具体的な不利益を生んでいる。メモの詳細を
開いてもリロードすれば消え、共有できず、iOS のスワイプバックが効かない。
`loading.tsx` と `error.tsx` は Route Segment 単位でしか置けないので、置き場もない。

土台（`features/` への整理）は前の change で済んでいる。`lib/` と `features/` の
データアクセス層はすでに分離されており、Route Handler は「認証 → 関数呼び出し →
JSON」の薄い殻でしかない。殻を剥がして Server Components から直接呼ぶ。

## What Changes

### 画面を Route Segment に分ける

- **BREAKING**（利用者から見た経路が変わる）タブと詳細に URL を与える
  - `/` メモ一覧 / `/review` 復習 / `/record` 記録 / `/memos/[memoId]` 詳細
- タグの絞り込みを `/?tag=<id>` として URL に載せる。詳細から戻ったときに
  絞り込みが保たれるのは、これによる
- 通知からの復帰先を `?tab=review` から `/review` に変える
- `loading.tsx` / `error.tsx` を置ける場所ができる（実際に置くのは次の change）

### 読み取りを Server Components へ移す

- `app/page.tsx` ほか各 Route を Container ツリーに組み替える
  （`MemoListContainer` / `DueReviewContainer` / `TagListContainer` /
  `LearningRecordContainer`）
- Container は取得だけを行い、表示は Presentational に渡す（Container/Presentational）
- `features/` の取得関数を React の `cache()` でラップし、Request Memoization を効かせる
- `server-only` を D1 に触るモジュールへ入れ、クライアントバンドルへの流入を
  ビルドで止める。**ただし `cron-worker` が読むモジュールには付けない**
  （Workers 側の import で throw する）
- `lib/session.ts` に `verifySession()` を足し、データアクセス認可をデータフェッチ層へ寄せる
- 読み取り専用の Route Handler 5 本を削除:
  `/api/memos` GET・`/api/review/due`・`/api/tags`・`/api/learning-record`・
  `/api/tags/suggestion` GET

### Non-goals

- **書き込みは Server Actions にしない。** 次の change で行う。この change の間、
  保存・採点・タグ操作は手書き `fetch` のままで、書き込み後の再取得は
  `router.refresh()` に置き換える
- `loading.tsx` / `error.tsx` / `<Suspense>` を実際に置くこと。置き場を作るだけ
- キャッシュ（第3部・第3.1部）。全画面が利用者固有で効く場面が無いため、
  適用範囲外と決めてある
- `features/` の中を `queries.ts` / `components/` へ割り直すこと。必要になった分だけ割る

## Capabilities

### New Capabilities

- `navigation`: 画面がどの URL を持ち、戻る・再読み込み・共有がそれぞれ何を
  復元するか。いまの spec 群は画面を「一覧」「詳細」と呼ぶだけで URL を語って
  おらず、URL の約束を書く場所が無い

### Modified Capabilities

- `memo-capture`: 「詳細から戻ったときに絞り込みの状態を保つ」を、**再読み込みでも
  保たれる**ところまで広げる。詳細と絞り込みが URL を持つことによる

## Impact

**触るもの**

- `app/` ほぼ全域。`app-shell.tsx`（12KB）はタブの枠と経路の受け口だけに縮む
- `app/api/` の読み取り 5 本を削除。残るのは書き込みと通知購読
- `features/*/` の取得関数に `cache()` と `server-only`
- `lib/session.ts` に `verifySession()`

**利用者から見える変化**

- タブの移動と詳細の開閉が URL の遷移になる。**切り替えにサーバー往復が挟まる**
- 詳細をリロードしても消えない。共有でき、iOS のスワイプバックが効く
- 絞り込んだ一覧の URL を共有できる

**リスク**

- タブ切替の体感。`<Link>` の prefetch で緩和できるが、Cloudflare Workers と D1 の
  実測を見ないと分からない。耐えられなければ該当タブだけクライアント保持へ戻す
- `app-shell.tsx` が unmount 前提で守っていたもの（書きかけの本文、タグの提案、
  初回の告知）の置き場。Route をまたぐと消える。**下書きが黙って失われるのが最も痛い**
- `startGeneration` の `ctx.waitUntil`（`lib/db.ts` の `getDeferrer`）は
  Route Handler の中で動いている。この change では書き込みを触らないので影響しないが、
  次の change の前提として確かめておく

**改定する過去の判断**

- `add-tags` の D5「絞り込みは URL に持たない」。理由は「タブと同じ扱いにする」の
  一文だけで、そのタブを URL に載せると決めた時点で根拠が消えた
