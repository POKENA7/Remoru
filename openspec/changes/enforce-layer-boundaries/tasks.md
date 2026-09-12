## 0. 前提

- [x] 0.1 `git fetch origin && git log --oneline HEAD..origin/main` で差が無いことを確かめる（L14）。
      `npm run harness:focus -- enforce-layer-boundaries`（`review-with-change-context` が済んでいれば）
      → **差は 0 件**（`HEAD` = `d7d12b0` = `origin/main`、2026-09-12）。
      `harness:focus` は `package.json` に無い（`review-with-change-context` が未 merge）ので宣言していない

## 1. 検査

- [x] 1.1 `tests/architecture/layers.arch.test.ts` の判定を `violations(rule, path, src)` の形に切り出す（design D3）。
      既存の規則 1・5 が同じ結果を返すこと（緑のまま）
      → `RULES[]`（`id` / `applies` / `forbids` / `remedy`）と `violations()` に切り出した。
      規則 1・5 の判定式は元のまま（`@/app/` と `../app/` / `@/features/`）で、相対 `../features/` を足しただけ。緑
- [x] 1.2 規則 2・3・4 を足す（design D1）。メッセージは design D2 の形。いまのツリーで走らせて**違反 0 件**であること。
      違反があれば列挙し、直すか理由つきで許容するかを利用者に聞く
      → **違反 0 件**。5 規則 18 件のテストが緑（138ms）。許容リストは要らなかった（design Context の見立て通り）。
      走査対象は `app` `features` `lib` `hooks` `cron-worker/src`。`"use client"` のファイルは 14 件
- [x] 1.3 規則 5 つそれぞれに注入テストを書く。5 つとも赤 → 戻して緑（L06）
      → 2 段で確かめた。
      **(a) `violations()` への注入**（テストとして常設。design D3）: 5 規則とも「違反 → 非空」「正しい import → 空」。
      メッセージに `layers #N` / ファイル名 / 直し方が入ることも見ている。
      **(b) 実ファイルの注入**（手で 1 回。走査の配線まで通っているかの確認）:
      `app/_probe/r2.tsx`（`@/lib/db`）→ #2 赤、`app/_probe/r3.tsx`（`"use client"` + `@/features/memo/queries`）→ #3 赤、
      `cron-worker/src/_probe-r4.ts`（`../../lib/db`）→ #4 赤、`features/memo/_probe-r1.ts`（`@/app/layout`）→ #1 赤、
      `lib/_probe-r5.ts`（`@/features/memo/memos`）→ #5 赤。**5 件とも取り除くと緑に戻る**
- [x] 1.4 規則 3 が `actions` の import を**違反にしない**ことを、Client Component から `../actions` を import する
      仮のソースで確かめる（正規の使い方を弾かない）
      → `"use client"` + `../actions` + `@/features/memo/actions` の 2 行を渡して空。
      併せて「コメント中の `"use client"` を対象にしない」も常設のテストにした（先頭 3 行の行頭だけを見る）

## 2. `check:build`

- [x] 2.1 `package.json` に `check:build` があるか見る。無ければ `next build` として足し、`check` の末尾に並べる（design D4）
      → **実装時は無かった**（`measure-first-paint` は未 merge）ので足した。
      その後 A1 が先に merge され、**rebase で package.json は main 側を採用**した。
      いまの並びは `format → lint → types → test → secrets → build → bundle`（D4 の通り）。
      この change は package.json に何も足していない。
      **L06 の確認**: `"use client"` + `import "server-only"` の経路を 1 つ作ると
      `check:build` は exit 1 で落ち、`'server-only' cannot be imported from a Client Component module` を出す。
      取り除くと exit 0。**規則 3 は検査とビルドの二重で止まる**（ビルドは経路から辿れるときだけ）
- [x] 2.2 `next build` のあとに `git status --porcelain` が空のままであること
      → 空。`.next/` は gitignore 済み、`next-env.d.ts` は追跡されているが書き換わらなかった。
      所要は温まった状態で **2.41 / 2.46 / 2.74 秒**（3 回、`real`）、冷えた 1 回目は 8.78 秒
- [x] 2.3 CI が緑になることを見る（Linux で `next build` が通るかはここで初めて分かる——L07）
      → PR #6 の `check` が **pass**。Linux（`ubuntu-latest`、`npm ci` + ネイティブバイナリの補填）で
      `next build` も通った。手元にしか無い依存やロケール依存は出なかった

## 3. 規則の文書化

- [x] 3.1 `CLAUDE.md` の「置き場」に D1 の表を**検査と同じ番号・同じ言葉で**書く。
      「詳細は `tests/architecture/layers.arch.test.ts`」の 1 行を添える
      → 「置き場」の末尾（`cron-worker/` の段の後）に 5 行の表を置いた。
      規則 3 が `next build` でも出ること、規則 4 は実行時にしか出ないこと、
      **どちらも型検査では出ない**ことを添えた
- [x] 3.2 `docs/Harness Engineering Checklist.md` の「禁止されている依存関係が CI で FAIL する」
      「Architecture 違反のエラーメッセージに修正方法または参照先が含まれる」「Build が自動検証できる」を証拠つきで ✅ にする
      → 3 件とも ✅。証拠を各行の末尾に付けた（`check:build` / 規則 #1〜#5 と注入テスト / `layers #2` の実メッセージ）。
      **`docs/Harness Engineering Checklist.md` は proposal の Impact 表に無い**——このタスクが名指ししているので触った

## 4. 締め

- [x] 4.1 `npm run check` が緑
- [x] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
      → 2 回目で指摘なし。受領書 `.harness/reviews/129e63e6…json`

### 4.2 の 1 回目のレビューで出た 2 件

| 指摘 | 判定 | 対応 |
|---|---|---|
| `specifiers()` が `export … from` の再エクスポートを拾わないので、規則 2/3/4 を 1 行で迂回できる | **正しい**。`export { getDb } from "@/lib/db"` は `import` の語を含まない | `specifiers()` に `^\s*export\s+[^;]*?from` を足した。`app/_probe/re.ts` に実ファイルで注入して #2 が赤くなることも確認。常設のテスト「再エクスポートでも迂回できない」も足した（#2 の名前付き・`export *`、#3 の `export *`） |
| CI に Clerk の環境変数が無いので `next build` が落ちる可能性が高い | **そうならなかった**。`.env.local` を退避し `CLERK_SECRET_KEY` と `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` を外して `npm run check:build` を走らせて **exit 0**。静的化されるのは `/_not-found` と `/manifest.webmanifest` だけで、Clerk を使う経路は全部 `ƒ`（動的）なのでビルド時に鍵を要求しない | 変更なし。CI（Linux）での確認は 2.3 で行う |

## 5. 途中で見つかった、この change の外の欠陥

**`scripts/harness/precommit-gate.sh:86` が macOS の bash 3.2 + UTF-8 ロケールで落ちる。**

```
門: この差分（$hash）のレビュー受領書が無い。…
                  ^^^^^ 直後が全角の "）"
```

bash 3.2.57（macOS 同梱）は `LANG=*.UTF-8` のとき `（`（U+FF09）の**先頭バイトを変数名に取り込む**。
`set -u` があるので `hash\xef: unbound variable` で **exit 127** になり、門は **exit 2 を返せない**。

| 影響 | 中身 |
|---|---|
| 門が fail open する | 「受領書が無い」経路は exit 2 ではなく 1 で終わる。PreToolUse の 2 以外は**ブロックしない**ので、受領書なしでコミットが通る |
| `check:test` が赤いまま | `precommit-gate.test.ts` の (a)(c) が落ちる。**Stop hook と門の両方が通らない** |
| CI では出ない | GitHub の runner は `C.UTF-8` で、そこでは同じ行が通る（L07 そのもの） |

- 原因は `$hash` の直後の全角括弧だけ。`${hash}` にすると 11 件とも緑になる
- **利用者の判断（2026-09-12）: このブランチで直す。** `precommit-gate.sh:86` だけを `${hash}` にした
- **その後 A5（`review-with-change-context`）が先に main で同じ修正を入れていたことが判明した。**
  rebase 後、この change の `precommit-gate.sh` の差分は 0。`scripts/spawn-change.sh` の同型 4 か所も
  main 側で直っている
- **3 セッションが独立にこれを踏んでいる。** `.learnings/failures.jsonl` の
  07:02（review-with-change-context）/ 07:05（enforce-layer-boundaries）/ 07:11（measure-first-paint）が
  全て `check:test` の precommit 落ち。**同じ欠陥を 3 回別々に調べ直したことになる**

## 6. rebase（2026-09-12）

PR がコンフリクトしたので `origin/main`（`2289c43`）へ rebase した。main は 2 件進んでいた——
A5 `review-with-change-context`（`a728e1c`）、A1 `measure-first-paint`（`2289c43`）。

| ファイル | 衝突 | 解消 |
|---|---|---|
| `package.json` | `check` の並びと `check:build` / `check:bundle` / `harness:focus` | **main 側を全採用。** A1 が同じ `check:build` を足していたので、この change の分は要らなくなった |
| `.learnings/failures.jsonl` | 3 worktree が同時刻に追記 | **和集合を時刻順に。** 追記専用の記録なので、どちらも消さない |
| `CLAUDE.md` / `docs/Harness Engineering Checklist.md` | なし（自動 merge） | 層の 5 規則の表と 3 項目の ✅ はそのまま残った |
| `scripts/harness/precommit-gate.sh` | なし | **main 側に同じ修正が入っていたので差分 0 になった**（5 節） |
