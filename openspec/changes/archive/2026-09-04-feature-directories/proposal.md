## Why

`lib/` は 24 個の実装ファイルと 30 個のテストがフラットに並んでおり、ドメイン
（メモ・復習・問答・タグ・通知）と横断的な基盤（D1 の取り出し、認証、テスト補助）
が同じ階層に混ざっている。`openspec/specs/` には review-scheduling・review-session・
tag-suggestion・notification・quiz-item という機能の分類がすでに存在するのに、
実装側にその境界が現れていないため、spec と実装の対応を名前から辿れない。

この直後に控えている「Route 分割と読み取りの Server Components 化」は `app/` と
`lib/` の両方を大きく書き換える。**リネームと書き換えを同じ差分に混ぜるとレビューが
成立しない**（ハーネスの受領書は差分のハッシュ単位で発行される）。先に置き場だけを
確定させ、振る舞いを変えない移動として切り離す。

## What Changes

- `lib/` の実装とテストを、機能ごとの `features/<機能>/` へ移す。分類は
  `openspec/specs/` の capability 名に合わせる
- 横断的なモジュールだけを `lib/` に残す（D1 の取り出し・セッション・テスト補助）
- `lib/current-user.ts` を `lib/session.ts` に改名する。次の change で
  「認証済みか確かめる」責務が加わり、`current-user` という名前が実態と合わなくなる
- feature 内の相対 import（`./memos`）は相対のまま、feature をまたぐ import は
  `@/features/<機能>/…` の絶対パスにする。**またいでいることが import 文から見える**
  ようにする
- `cron-worker/src/` が `../../lib/` を相対パスで参照している 5 本を追従させる
- **振る舞いは変えない。** 公開される関数・型・シグネチャ・SQL・画面はいずれも
  変更しない。`npm run check` が移動の前後で同じ結果になることが完了条件

### Non-goals

- `app/` は触らない。`app/` は次の change で Route ツリーへ解体されるため、
  ここで動かすと二度手間になる
- `server-only` の導入、`cache()` によるメモ化、Container/Presentational への分離は
  次の change で行う
- `db/schema.ts` `db/types.ts` は移動しない。全機能が参照する共有スキーマである

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。振る舞いが一切変わらないため、`.openspec.yaml` に `skip_specs: true` を置く。

## Impact

**移動するもの**（実装 20 / テスト 27）

| 移動先 | モジュール |
|---|---|
| `features/memo/` | `memos.ts` |
| `features/review/` | `review.ts` `review-scheduler.ts` |
| `features/quiz/` | `quiz-items.ts` `quiz-text.ts` `quiz-generation.ts` `quiz-generation-run.ts` `quiz-generation-client.ts` |
| `features/tag/` | `tags.ts` `tag-text.ts` `tag-suggestion.ts` `tag-suggestion-run.ts` `tag-suggestion-client.ts` |
| `features/notification/` | `push.ts` `notification-timing.ts` `notification-message.ts` `notification-settings.ts` `notification-subscriptions.ts` |
| `features/record/` | `learning-record.ts` `retention-layers.ts` |
| `features/first-run/` | `first-run.ts` `first-run-text.ts` |

**残すもの**: `lib/db.ts` `lib/session.ts`（旧 `current-user.ts`）`lib/test-db.ts` `lib/test-d1.ts`

**追従が要るもの**

- `app/api/**/route.ts`（12 本）と `app/**/*.tsx` の import。`@/lib/current-user` が
  13 箇所、`@/lib/db` が 12 箇所
- `cron-worker/src/index.ts` `send.ts` `notifications.test.ts` の
  `../../lib/{notification-message,notification-timing,push,review-scheduler,test-d1}`
- `lib/` 内の相対 import 全 75 本

**リスク**

- 移動と同時に中身を直したくなること。`git mv` と import の書き換え以外を
  この change に入れない
- `cron-worker/` は `tsconfig.json` の `exclude` に入っており、ルートの型検査が
  見ていない。壊れても `check:types` は緑のまま通る。cron-worker 側の型検査を
  この change で確かめる
