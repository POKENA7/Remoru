## 0. 前提

- [ ] 0.1 前の 3 change が済んでいる。`npm run harness:focus -- move-client-boundary-to-leaves`
- [ ] 0.2 `docs/perf.md` の最新の行から、この change の目標（KB）を決めて design D4 に書く

## 1. 一覧表

- [ ] 1.1 `grep -rl '"use client"' app features` の全ファイルについて design D1 の表を埋める。理由「無し」の数を数える
- [ ] 1.2 下ろす順を表に書く（design D2）

## 2. 改名（別コミット）

- [ ] 2.1 `"use client"` のファイルを `-client.tsx` に改名し、import を直す。**この 2.1 だけでコミット**
- [ ] 2.2 `layer-boundary` に規則 6 を足す。注入で赤、戻して緑（L06）。`CLAUDE.md` の表に規則 6

## 3. 境界を下ろす（表の順に。1 ファイルにつき 1 コミット）

各段の完了条件: `npm run check` と E2E が緑 / 関係する spec のシナリオを `next dev` で辿る / `check:bundle` の値を記録

- [ ] 3.1 `memo-detail` を design D2 の 4 つに分ける
- [ ] 3.2 表の 2 番目
- [ ] 3.3 表の 3 番目（以降、表の行の数だけ続ける。ここに行を足す）
- [ ] 3.4 分けた表示部品に描画のテストを最低 1 つ付ける（design D5）

## 4. 結果

- [ ] 4.1 `bundle-budget.json` を実測 + 5% に下げる。目標に届いたか、届かなければ数値を design D4 に書く
- [ ] 4.2 `docs/perf.md` の手順で「一覧が読めるまで」を 5 回測り、行を書く
- [ ] 4.3 staging で利用者に一周触ってもらう（L10）

## 5. 締め

- [ ] 5.1 `npm run harness:review` で受領書を作り、コミットの門を通す
- [ ] 5.2 `docs/nextjs-rework-plan.md` の表に結果を書き、「本の章と現状の対応」の表を更新する
