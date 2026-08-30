## Why

検査の部品は既にある。**走るかどうかが LLM の裁量に委ねられている**ことが問題である。

この不一致は、このリポジトリ自身の記録が実証している。`.learnings/index.json` は
L01〜L11 の引用数を「0 件、L04 だけ 1 件」と記録している。しかし git の trailer を
数えると、実際はこうである。

```
$ git log --all --grep "Learning: L" --format="%b" | grep -o "Learning: L[0-9]*" | sort | uniq -c
   2 Learning: L03
   9 Learning: L04
   5 Learning: L05
  24 Learning: L06
```

**機械が数えられる側（commit trailer）は 15 change ぶん生き続け、人が更新する側
（index.json）は最初の change で止まった。** 同じ設計の同じファイルで、自動の部分だけが
残った。これは仕組みの良し悪しではなく、**裁量に依存する経路は静かに止まる**という
観測である。

出口も開いていない。`.learnings/archive.md` の昇格待ち項目（コントラストの回帰テスト）は
「未実装のまま 3 change 経過したら、昇格の出口が機能していない信号として扱う」と自分で
書いている。change 1 で書かれ、今は change 16 である。**信号はとうに鳴っている。**

そして最も引用された学びは L06「検査は、違反をわざと入れて赤くなるまで検査ではない」で、
24 回引用されながら**それ自体は散文のまま**である。`add-learning-loop` の design.md D2 が
定めた強度階層（実行可能な検査 > 設定 > 文書 > メモ）でいえば、24 回使われた知識が
最下層に置かれ続けている。

検査そのものも足りていない。lint と formatter は**ゼロ**。`npm run predeploy` が test と
typecheck を縛るが、それは**デプロイのときだけ**で、コミットは素通りする。

## What Changes

### 検査を足す

- **Biome 2.5 を導入する。** lint と format を 1 バイナリで賄う。設定は `biome.json` 1 枚。
  既存コードの一括整形は**独立した 1 コミット**で先に済ませ、以後の差分を汚さない。
- **検査の入口を `package.json` の script に一本化する。** `check:format` / `check:lint` /
  `check:types` / `check:test` / `check:secrets`、それらを束ねる `check`。
  **hooks も CI も、この script 以外を呼ばない。** 定義が 2 か所にあるとズレる。

### 決定論的に走らせる（2 層）

- **`.claude/settings.json` に hooks を置く。** リポジトリにコミットして共有する。3 段構え。

  | 契機 | 走るもの | 落ちたとき |
  |---|---|---|
  | `PostToolUse`（`Edit`/`Write` が `.ts`/`.tsx` を触った直後） | その 1 ファイルの `biome check --write` | 自動修正。LLM に判断させない |
  | `Stop`（ターンの終わり） | 差分があるときだけ typecheck と test | exit 2 で終わらせない |
  | `PreToolUse`（`git commit` を捕まえる） | `check` 全部 + secret scan + **レビュー** | exit 2 でコミットを止める |

- **GitHub Actions を新設する。** ローカルの hooks を消しても効く最終防衛線。`.github` は
  現在存在しない。秘密情報を要する検査（デプロイ）は CI に載せない。
- **git hooks は使わない。** 層が 3 つになると、どれが落ちたのか分からなくなる。

### レビューを門にする

- **コミットの直前にレビューを強制する。** 門は `PreToolUse` の command hook で、
  差分のハッシュに紐づいた**レビュー済みの受領書**が無ければ落ちる。受領書は
  `npm run harness:review` だけが作る。**門は安定した仕組みだけで作り、実験的な機能に
  依存させない**（依存させると、機能が変わった日に門が静かに開く）。

### 失敗が次に活きるようにする（`add-learning-loop` の段階 2・段階 3）

- **失敗を機械が記録する。** hook が検査の失敗を `.learnings/failures.jsonl` に追記する。
  LLM を介さない。記録するのは検査 ID・終了コード・stderr の先頭 1 行・change 名だけ。
- **同じ検査が 3 回落ちたら棚卸を要求する。** `Stop` hook が exit 2 で終了を拒み、
  「規則にするか、検査にするか、明示的に見送るか」を選ばせる。選んだ結果は
  `npm run harness:promote` が記録し、それでロックが外れる。**無限ループにしない**
  （1 候補につきブロックは 1 回、解消はコマンドで行う）。
- **引用数の集計を git から自動で行う。** `index.json` の手更新をやめる。上の観測が
  そのまま「手更新は止まる」の証拠である。
- **L06 を昇格させる。** 「違反を注入して赤くなることを確かめる」を散文から実行可能な
  検査に移す。この change で足す**すべての検査に、わざと壊した入力を食わせて赤くなる
  ことを確かめるテスト**を付ける。緑のまま何も守らない検査を作らないため。

### 今回やらないこと

- **git hooks（pre-commit / pre-push）**。上記のとおり層を増やさない。
- **既存の Biome 指摘をすべて直すこと**。一括整形は行うが、lint の指摘は初回は
  警告に留め、赤にする範囲は運用しながら広げる。
- **アプリの挙動を変えること**。整形以外、製品コードは触らない。
- **CI からのデプロイ**。秘密情報の取り扱いを決めていない。

## Capabilities

### New Capabilities

なし。開発ハーネスの変更であり、製品の振る舞いは変わらない。`.openspec.yaml` に
`skip_specs: true` を置く（`add-learning-loop` と同じ扱い）。

### Modified Capabilities

なし。

## Impact

| 対象 | 変更 |
|---|---|
| 依存 | `@biomejs/biome` 2.5 を devDependency に追加（`-E` で固定） |
| 新規 | `biome.json`, `.claude/settings.json`, `.github/workflows/ci.yml`, `scripts/harness/*`, `.learnings/failures.jsonl` |
| 変更 | `package.json`（scripts）, `.learnings/index.json`（自動生成に変更）, `.learnings/active.md`（L06 に昇格済みの印）, `.learnings/archive.md`（昇格の記録）, `CLAUDE.md`（ハーネスの節を追加） |
| 製品コード | 一括整形のみ。挙動は変えない |
| 既存資産 | `scripts/scan-secrets.sh` はそのまま `check:secrets` から呼ぶ。vitest 31 ファイルはそのまま |
