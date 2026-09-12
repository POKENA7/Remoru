## 0. 前提

- [ ] 0.1 `git fetch origin && git log --oneline HEAD..origin/main` で差が無いことを確かめる（L14）。
      `npm run harness:focus -- enforce-layer-boundaries`（`review-with-change-context` が済んでいれば）

## 1. 検査

- [ ] 1.1 `tests/architecture/layers.arch.test.ts` の判定を `violations(rule, path, src)` の形に切り出す（design D3）。
      既存の規則 1・5 が同じ結果を返すこと（緑のまま）
- [ ] 1.2 規則 2・3・4 を足す（design D1）。メッセージは design D2 の形。いまのツリーで走らせて**違反 0 件**であること。
      違反があれば列挙し、直すか理由つきで許容するかを利用者に聞く
- [ ] 1.3 規則 5 つそれぞれに注入テストを書く。5 つとも赤 → 戻して緑（L06）
- [ ] 1.4 規則 3 が `actions` の import を**違反にしない**ことを、Client Component から `../actions` を import する
      仮のソースで確かめる（正規の使い方を弾かない）

## 2. `check:build`

- [ ] 2.1 `package.json` に `check:build` があるか見る。無ければ `next build` として足し、`check` の末尾に並べる（design D4）
- [ ] 2.2 `next build` のあとに `git status --porcelain` が空のままであること
- [ ] 2.3 CI が緑になることを見る（Linux で `next build` が通るかはここで初めて分かる——L07）

## 3. 規則の文書化

- [ ] 3.1 `CLAUDE.md` の「置き場」に D1 の表を**検査と同じ番号・同じ言葉で**書く。
      「詳細は `tests/architecture/layers.arch.test.ts`」の 1 行を添える
- [ ] 3.2 `docs/Harness Engineering Checklist.md` の「禁止されている依存関係が CI で FAIL する」
      「Architecture 違反のエラーメッセージに修正方法または参照先が含まれる」「Build が自動検証できる」を証拠つきで ✅ にする

## 4. 締め

- [ ] 4.1 `npm run check` が緑
- [ ] 4.2 `npm run harness:review` で受領書を作り、コミットの門を通す
