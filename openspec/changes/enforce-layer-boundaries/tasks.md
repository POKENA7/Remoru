## 1. 検査

- [ ] 1.1 `lib/layer-boundary.test.ts` を書く（design D1〜D3）。判定関数はファイル読みと分け、文字列で試せる形
- [ ] 1.2 いまのツリーで走らせ、**赤になった箇所を全部列挙する**。`app/api/**` 以外に違反があれば、
      許容リストに「消す change の名前」つきで載せる。名前を付けられない違反は、この change で直すか
      利用者に聞く
- [ ] 1.3 規則 5 つそれぞれに注入テストを書く（design D4）。5 つとも赤 → 戻して緑
- [ ] 1.4 許容リストの項目に change の名前が無いと赤になることを、注入で確かめる（design Risks）
- [ ] 1.5 `check:build` が `package.json` に存在するか見る。無ければ `next build` を `check:build` として足す（design Open Questions）

## 2. 規則の文書化

- [ ] 2.1 `CLAUDE.md` の「置き場」の節に、D1 の表を**検査と同じ番号・同じ言葉で**書く。
      「詳細は `lib/layer-boundary.test.ts`」の 1 行を添える
- [ ] 2.2 `docs/Harness Engineering Checklist.md` の「禁止されている依存関係が CI で FAIL する」
      「Architecture 違反のエラーメッセージに修正方法または参照先が含まれる」を証拠つきで ✅ にする

## 3. 締め

- [ ] 3.1 `npm run check` が緑。CI が緑
- [ ] 3.2 `npm run harness:review` で受領書を作り、コミットの門を通す
