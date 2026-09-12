## 1. 土台

- [ ] 1.1 `@playwright/test` `@clerk/testing` を devDependency に入れる。`npx playwright install chromium`
- [ ] 1.2 `playwright.config.ts` を書く。`webServer` が `npm run dev` を起動し、`baseURL` を向ける。
      ブラウザは chromium 1 つ、ビューポートは iPhone 相当（`devices["iPhone 14"]` の viewport だけ借りる）
- [ ] 1.3 Clerk の開発インスタンスにテスト用の利用者を作る（**人が行う**）。`.env.local` に
      `E2E_CLERK_USER_EMAIL` `E2E_CLERK_USER_PASSWORD` を置く。Testing Tokens が使えることを
      `clerkSetup()` だけのテストで確かめる。使えなければ design D3 を書き換える
- [ ] 1.4 `e2e/global-setup.ts` を書く（design D3）。`storageState` が `e2e/.auth/` に保存され、
      `.gitignore` に入っていること
- [ ] 1.5 design の Open Questions（ローカル D1 の場所）に答えを書く

## 2. シナリオ

- [ ] 2.1 `e2e/smoke.spec.ts` を書く（design D1・D2）。各段に対応する spec の Requirement 名をコメントに書く。
      「戻る」の段は `test.fixme` にし、理由（経路が無い。`server-side-reads` 2.3 で外す）を書く
- [ ] 2.2 `getByRole` で取れない要素があれば、**製品側に `aria-label` を足す**（design Risks）。足したものを列挙する
- [ ] 2.3 `npm run check:e2e` が手元で緑
- [ ] 2.4 保存の Route Handler を一時的に 500 にして赤、戻して緑を確かめる（design D5）。結果をここに書く

## 3. CI

- [ ] 3.1 GitHub Environment `e2e` に Clerk の test 鍵 2 つとテスト利用者の資格情報を入れる（**人が行う**）
- [ ] 3.2 `ci.yml` に `e2e` ジョブを足す（design D4）。secret が無いときは飛ばし、飛ばしたことを出力する
- [ ] 3.3 CI で緑になることを見る。所要時間を design に記録する

## 4. 締め

- [ ] 4.1 `CLAUDE.md` のハーネスの表に `check:e2e` の行を足す（契機: CI と手動。`check` には含まれない）
- [ ] 4.2 `.learnings/active.md` の L05・L10 に「E2E が入った範囲」を 1 行追記する。
      iOS 固有の確認は引き続き人が行うことを明記する
- [ ] 4.3 `npm run harness:review` で受領書を作り、コミットの門を通す
