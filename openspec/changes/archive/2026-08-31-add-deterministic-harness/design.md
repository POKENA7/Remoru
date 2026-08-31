## Context

動機は proposal.md の `## Why` を参照。ここでは設計を説明するのに必要な現状と制約だけを述べる。

**既にあるもの**: vitest のテスト 31 ファイル、`npm run test` / `typecheck` / `predeploy`、
`scripts/scan-secrets.sh`（全履歴を走査する鍵の検査）、`.learnings/` 3 ファイル、
`openspec/` の change 運用。**無いもの**: lint、formatter、`.claude/settings.json`、`.github`、
どの検査も自動では起動しない。

**制約1: 裁量に依存する経路は静かに止まる。** proposal.md で示した index.json と commit
trailer の乖離が実測である。したがって「LLM に走らせる」「人が思い出す」を前提にした設計は
採らない。**止まったことが観測できない仕組みを作らない**ことが、この設計の第一制約である。

**制約2: 門は fail closed でなければならない。** 検査が「動かなくなったとき」に何が起きるかで
設計を選ぶ。落ちる（うるさい）ほうが、静かに素通りするより良い。L06 が 24 回引用された
理由もこれである。

**制約3: 単独開発者・断続的な稼働。** `add-learning-loop` design.md の制約 3・4 をそのまま
引き継ぐ。手作業のステップが 1 つでもあると回らない。3 週間触らないことがある。

**制約4: 待ち時間が長い仕組みは外される。** 編集のたびに数秒待たされる設計は、いずれ
`disableAllHooks` で無効化される。速度は正しさと同じ重みの要件である。

**利用可能な足場（すべて公式ドキュメントで確認済み）**: `.claude/settings.json` の hooks
（`PreToolUse` / `PostToolUse` / `Stop`、matcher は `tool_name` に対する完全一致または正規表現）、
exit code 2 による阻止（`PreToolUse` = ツール呼び出しを止める、`Stop` = 終了を止めて会話を
継続、`PostToolUse` = 阻止できず stderr を LLM に見せるだけ）、stdin に渡る JSON
（`tool_name` / `tool_input.command` / `tool_input.file_path` / `stop_hook_active`）、
`$CLAUDE_PROJECT_DIR`、command hook の既定 timeout 600 秒。

## Goals / Non-Goals

**Goals:**

- 検査の起動から LLM の裁量を取り除く。走ったかどうかが**ログではなく状態**で分かること
- 検査が壊れたときに**赤くなる**こと。緑のまま何も守らない検査を作らないこと（L06）
- 失敗が**人手を介さず**記録され、繰り返した失敗が**強制的に**より強い層へ押し上げられること
- 編集のたびに走るものは**体感ゼロ**に収めること
- 仕組み自体をコミットして共有し、`rm -rf .claude` で完全に元に戻せること

**Non-Goals:**

- 敵対的な回避への防御。目的は**忘却と裁量の排除**であって、意図的な迂回の阻止ではない
  （迂回されたことは CI で観測できる）
- 検査の網羅性を今回で完成させること。層を作るのが目的で、ルールは後から足す
- 他プロジェクトへ持ち出せる汎用ハーネス化

## Decisions

### D1: 検査の定義は `package.json` の script にだけ置き、hooks も CI もそれを呼ぶ

```
check:format   biome format .            （--write は付けない。見るだけ）
check:lint     biome lint .
check:types    tsc --noEmit
check:test     vitest run
check:secrets  bash scripts/scan-secrets.sh
check          上の5つを順に
```

hooks と CI に検査の中身を書かない。**定義が 2 か所にあると必ずズレ、CI だけが赤い状態が
生まれる。** ズレたときに気づく手段が無いので、単一の定義に寄せる。

*代替案*: hook の中に直接コマンドを書く。却下。settings.json は JSON で、複数コマンドの
連結・終了コードの扱いが読めなくなる。

### D2: hook は 3 段に分け、頻度と重さを反比例させる

| 契機 | matcher | 走るもの | 実測見込み |
|---|---|---|---|
| `PostToolUse` | `Edit\|Write` | 触った 1 ファイルの `biome check --write` | 数十 ms |
| `Stop` | （全件） | 差分があるときだけ `check:types` と `check:test` | 数秒〜十数秒 |
| `PreToolUse` | `Bash` | `check` 全部 + レビューの受領書 | 数十秒 |

制約 4 への回答である。`PostToolUse` に test を置くと 1 編集ごとに待ちが積み、必ず外される。
`Stop` は 1 ターンに 1 回しか来ないので、そこに置く。

`PostToolUse` は**そもそも阻止できない**（ドキュメント記載。tool は既に実行済み）。したがって
ここには「止めたい検査」を置かない。置くのは**自動修正だけ**である。

### D3: 編集直後の整形は自動修正で行い、LLM に報告しない

`biome check --write <file>` を走らせ、結果を LLM に見せない（exit 0 で黙る）。整形は
判断の余地が無いので、報告すると文脈を食うだけになる。

*代替案*: 整形の差分を LLM に見せて次から気をつけさせる。却下。**LLM に癖を覚えさせる
必要が無い**のがこの層の価値である。覚えさせる設計は制約 1 に反する。

### D4: `Stop` hook は差分があるときだけ走り、`stop_hook_active` で再入を止める

```
stop_hook_active が true      → 何もせず exit 0（再入。既に一度止めている）
git status --porcelain が空   → 何もせず exit 0（読むだけのターン）
check:types / check:test 失敗 → failures.jsonl に追記し、exit 2 で終了を拒む
```

`Stop` の exit 2 は「終了を止めて会話を継続」であり、stderr がそのまま LLM への指示になる。
再入の判定を入れないと、直せない失敗で無限に回り続ける。

*代替案*: 常に走らせる。却下。質問に答えただけのターンで毎回テストが走ると、制約 4 で外される。

### D5: コミットの門は command hook で作り、`if` フィルタに依存しない

matcher は `Bash`、`if` は**使わない**。`git commit` かどうかは script が
`jq -r '.tool_input.command'` を見て自分で判定する。

ドキュメントは `if` の Bash パターン照合を「best-effort」と明記し、
**「ハードな allow / deny の強制には hook ではなく permission system を使え」**と書いている。
`if` は取りこぼすより過剰に発火する方向に倒れている（`$TOOL git push` でも発火する）ため
実害は小さいが、**門の判定を best-effort な仕組みに預けない**という制約 2 の適用として、
判定は自前で持つ。判定不能なときは**落とす側**に倒す。

### D6: レビューの門は「受領書」で作り、実験的な機能に依存させない

```
1. hook が git diff --cached（無ければ作業ツリーの差分）のハッシュ H を計算する
2. .harness/reviews/H.json があり、findings が空 → 通す
3. 無い、または findings がある → exit 2
   「npm run harness:review を実行せよ」を stderr に書く
4. harness:review だけが H.json を書く
```

Claude Code には `type: "agent"` の hook があり、`PreToolUse` を直接 block できる。
**それを門にはしない。** ドキュメントが「experimental and may change」と明記しており、
仕様が変われば hook が発火しなくなる ＝ **門が静かに開く**。制約 2 の直接の適用である。

受領書方式なら、レビューの実行側が壊れたときに起きるのは「受領書が作れない」であり、
門は**閉じたまま**になる。うるさいが、素通りしない。

差分のハッシュに紐づけるのは、**レビュー後に手を入れたら受領書が無効になる**ようにするため。
ファイルの有無だけを見ると、1 回レビューすれば以後何をコミットしても通ってしまう。

*代替案*: `type: "agent"` hook を門にする。却下（上記）。ただし**レビューの実行側**の候補
としては残す（D7）。

### D7: レビューの実行は `harness:review` に閉じ込め、実行系は差し替え可能にする

`scripts/harness/review.sh` の中身は 2 案ある。**タスク 4 で実測して決める。**

- 第 1 候補: `claude -p` にコミット前の差分を渡し、`/code-review` 相当の指示でレビューさせる
- 代替: `.claude/settings.json` の `type: "agent"` hook に `PostToolUse` として置き、
  受領書を書かせる（門は D6 のまま command hook）

どちらでも**門の設計は変わらない**。受領書という境界を挟んだので、実行系は交換できる。

どちらも動かないと分かった場合は、`harness:review` を「人が `/code-review` を実行し、
その結果を渡すと受領書を書く」形に落とす（門は残る）。

**採用したもの（タスク 6.1 の実測）**: `claude -p --output-format json` が非対話で
動くことを確かめ、第 1 候補を採った。ただし手元の CLI（1.0.89）の既定モデルは
`claude-opus-4-1-20250805` で 404 を返したため、`--model` を明示して渡す
（既定は `claude-sonnet-5`、`HARNESS_REVIEW_MODEL` で差し替え可）。

**運用で分かった制約 1**: `PreToolUse` は tool の**実行前**に判定する。`git add -A && git commit`
のような 1 コマンドは、判定の時点でまだ add されていないため常に「部分ステージ」に
見えて落ちる。ステージとコミットは別々の呼び出しに分ける必要がある。

**運用で分かった制約 2**: 判定は `git commit` の**部分文字列**で行うため、この語を含む
文書を書くだけのコマンドでも発火する。D5 が「過剰に発火する方向に倒れている」と
書いたとおりの挙動で、素通りより良い側なので直さない。

### D8: 失敗は JSONL に追記のみで記録し、LLM を介さない

`.learnings/failures.jsonl`、1 行 1 件。

```json
{"ts":"2026-08-30T12:00:00Z","check":"check:types","exit":2,"head":"app/foo.ts(12,3): error TS2345: ...","change":"add-deterministic-harness","phase":"stop"}
```

- 書くのは hook が呼ぶ `scripts/harness/record-failure.sh` のみ。LLM は書かない
- `head` は **stderr の先頭 1 行だけ**。全文を入れない（量と、public リポジトリでの露出のため）
- `check:secrets` の失敗は `head` を記録しない（伏せ字は済んでいるが、二重に防ぐ）
- `change` は `openspec/changes/` の作業中ディレクトリ名から取る。無ければ `null`
- JSONL にするのは**追記が競合しない**ため。JSON 配列だと読み書きが要り、並行実行で壊れる

*代替案*: 既存の `index.json` に混ぜる。却下。片方は生成物、片方は追記ログで、寿命も更新者も違う。

### D9: 同じ検査が 3 回落ちたら `Stop` hook が棚卸を強制し、コマンドで解消する

```
failures.jsonl を check ごとに数える
同一 check が同一 change 内で 3 回以上 かつ 未処理  → Stop hook が exit 2
    「L?? として規則にするか、検査を足すか、見送るかを選び、
     npm run harness:promote -- --check <id> --decision rule|check|skip --note "..." を実行せよ」
harness:promote が .harness/promotions.json に決定を書く → ロックが外れる
```

**1 候補につきブロックは 1 回**である。ロックが外れる条件をコマンドの実行にしたのは、
「対応したかどうか」を LLM の自己申告ではなく**ファイルの状態**で判定するため。
`decision: skip` を許すのは、逃げ道が無い門は必ず `disableAllHooks` で丸ごと殺されるからで、
見送りも**記録として残る**（`promotions.json` に理由が残り、再発時に見える）。

しきい値 3 に理論的根拠はない。`add-learning-loop` D4 の 12 件と同じく実務的な目安であり、
運用して見直す。

### D10: この change で足すすべての検査に、違反を注入して赤くなることを確かめるテストを付ける

L06 の昇格である。24 回引用された散文を、実行可能な層へ移す。

`scripts/harness/*.test.ts`（vitest、既存の 31 ファイルと同じ仕組み）に、各検査へ
**わざと壊した入力**を食わせて**非ゼロ終了することを assert する**テストを置く。

| 検査 | 注入する違反 |
|---|---|
| `check:format` | 整形されていない一時ファイル |
| `check:lint` | 未使用変数を含む一時ファイル |
| `check:types` | 型の合わない一時ファイル |
| `check:secrets` | 大文字と数字を含む鍵の形の値（既存 script の判定規則に沿った偽鍵） |
| コミットの門 | 受領書が無い状態 / 差分を変えた後の古い受領書 |
| `Stop` hook | 落ちる検査があり `stop_hook_active` が false の入力 |
| 棚卸の強制 | 同一 check の失敗を 3 件書いた `failures.jsonl` |

`check:secrets` の注入は**一時ファイルの作業ツリーではなく、使い捨ての git リポジトリ**に
対して行う。既存 script は git の全履歴の blob を走査するので、作業ツリーに置いただけでは
入力に入らない（L09 と同じ罠）。

*代替案*: 検査が赤くなることは手で 1 回確かめれば十分とする。却下。手で確かめた事実は
残らず、次に検査を書き換えたときに検証は繰り返されない。**L06 が 24 回引用されたのは、
1 回では足りないことの証拠**である。

### D11: `index.json` の引用数は生成物にする

`npm run learnings:index` が `git log --grep` を数えて `index.json` を書き直す。
手で数えた値は 15 change 分ずれていた（proposal.md の観測）。**同じ設計の同じファイルで、
機械が数える側だけが生き残った**ので、機械に寄せる。

`Stop` hook では走らせない（毎ターン差分が出るとうるさい）。CI と `harness:promote` から呼ぶ。

### D12: GitHub Actions は同じ script を呼ぶだけにする

`push` と `pull_request` で `npm ci` → `npm run check`。Node 22（ローカルと同じ）。
秘密情報は使わない。デプロイは載せない（proposal.md の「今回やらないこと」）。

CI の役割は**ローカルの hooks が消えた・無効化された場合の観測**である。緑のままでは
気づけないので、CI が赤くなることが唯一の「hooks が効いていない」の信号になる。

### D13: 既存コードの一括整形は独立した 1 コミットで先に行う

Biome の導入と同時に全ファイルが整形されると、以後のレビューでハーネスの差分と
整形の差分が混ざる。整形だけのコミットを先に置き、`git blame` の汚染も 1 コミットに閉じる。

lint のルールは初回は Biome の既定（`recommended`）に留め、赤にする範囲は運用しながら広げる。
最初から厳しくすると、この change が「既存コードの手直し」に化ける。

## Risks / Trade-offs

- **[受領書は偽造できる]** LLM が `.harness/reviews/H.json` を直接書けば門は通る → 緩和は
  しない。Non-Goals のとおり、目的は忘却と裁量の排除であって敵対的な迂回の阻止ではない。
  **ただしこれは「門が守れる範囲」の明示的な限界**であり、受領書に実行時刻とレビュー本文を
  含めておくことで、後から履歴で観測はできる。
- **[人が手でコミットすると門が無い]** git hooks を使わない選択の代償。Claude Code の外で
  `git commit` すれば検査は走らない → CI が受ける。ただし CI は**コミット後**なので、
  public リポジトリに秘密が入る事故には間に合わない。`scan-secrets.sh` は履歴を見る検査
  なので、この経路は元から後追いである（既知の限界として据え置く）。
- **[`Stop` hook が邪魔になる場面がある]** 「今は動かないまま置いて帰りたい」ときにも
  終了を拒む → 緩和は D9 と同じ逃げ道（`--decision skip`）と、差分が無ければ走らない設計。
  それでも耐えられなければ `disableAllHooks` があるが、**それが使われたら設計の失敗**として
  扱う（`.learnings` に記録する）。
- **[Biome と Next.js の規約が衝突する可能性]** `next lint` 系のルール（Server Component の
  制約など）は Biome では見られない → 今回は formatter + 汎用 lint だけを取り、Next 固有の
  検査は入れない。必要になったら別 change で `eslint-config-next` を足す余地は残す。
- **[hooks が Claude Code のバージョンに依存する]** ドキュメントで確認した仕様は今日のもので、
  イベント名やフィールドは変わりうる → 門を fail closed にした（D6）ので、変わったときは
  **落ちる側**に倒れる。加えて D10 の注入テストが、hook の入力形式を固定する回帰テストになる。
- **[`failures.jsonl` が public リポジトリに載る]** stderr の先頭 1 行を含む → `check:secrets`
  の失敗は本文を記録しない（D8）。他の検査の 1 行目にファイルパスと型エラーが載るのは許容する。
- **[門が閉じていると、わざと壊した木をコミットできない]** これは欠陥ではなく
  fail closed の当然の帰結だが、**「CI が本当に赤くなるか」を確かめるには一度だけ
  必要になる**（タスク 9.2）。`git commit` を含むコマンドは全て門を通るので、plumbing でも
  迂回できない。実際にやるときは `.claude/settings.json` を一時的に外して行い、
  外したことを記録に残す。**迂回できないこと自体は設計どおり**であり、
  ここを緩めない。
- **[CI が最初の実行で本物の欠陥を出した]** `package-lock.json` に macOS 分の
  TypeScript バイナリしか無く、Linux で `tsc` が起動しなかった。仕掛けた欠陥では
  ない。D12 が言う「hooks が効いていないことの信号」より前に、**手元では出ない
  欠陥の信号**として先に働いた。L07 の実例が 1 件増えたことになる。
- **[しきい値 3 と「1 候補 1 ブロック」の妥当性は未検証]** 厳しすぎれば棚卸が割り込み、
  緩すぎれば何も昇格しない → `promotions.json` に `skip` が並ぶかどうかで観測する。
  `skip` ばかりなら、しきい値ではなく**昇格先が用意されていない**ことの信号として扱う。

## Migration Plan

製品の挙動を変えないため、移行らしい移行はない。導入は 3 コミットに分ける。

1. **整形だけのコミット**: Biome 導入 + 一括整形（D13）
2. **検査と hooks のコミット**: scripts、settings.json、CI、注入テスト
3. **学びのループのコミット**: failures.jsonl、promote、index の自動生成、`.learnings` の更新

**`scan-secrets.sh` は 2 のコミット後に走らせる。** 履歴の blob を入力にするので、
コミット前に走らせても新しい行は入力に入らない（L09）。

**ロールバック**: `.claude/settings.json`、`.github/`、`scripts/harness/`、`biome.json`、
`.harness/` を削除し、`package.json` の scripts を戻す。整形コミットは戻さなくても無害。
製品コードの挙動・スキーマ・依存（Biome は devDependency）に副作用は残らない。

## Open Questions

以下は**今答えなくても approach もタスク分解も変わらない**ため、運用して得られるデータで答える。

- しきい値 3（同一検査の失敗回数）は妥当か → `promotions.json` の `skip` の割合で観測する
- lint をどこまで赤にするか → 初回は `recommended` のみ。指摘の実数を見てから広げる
- `Stop` hook の対象に `check:secrets` を加えるべきか → 履歴走査は重いので今回は入口を
  コミット前だけにした。実測が数秒で済むなら `Stop` にも下ろせる
