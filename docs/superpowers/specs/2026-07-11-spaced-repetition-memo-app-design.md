# 忘却曲線メモアプリ「Remoru」 設計書

## 1. 概要・目的

日常のちょっとしたことをメモし、エビングハウスの忘却曲線に基づいて定期的にクイズ形式で復習させることで、人間の記憶定着を助けるアプリ。大事な予定や本格的な学習はカレンダーや専用の学習アプリに任せ、本アプリは「ちょっとしたことを覚えておきたい」というニーズに特化する。

- 対象: 個人利用から開始し、将来的に複数ユーザーが利用できる形にする(ログイン機能あり)
- 提供形態: PWA (Progressive Web App)。ネイティブアプリのストア申請を避けつつ、ホーム画面追加・Push通知に対応する

## 2. アーキテクチャ

### 採用スタック

| 領域 | 採用技術 | 理由 |
|---|---|---|
| フロントエンド/バックエンド | Next.js (App Router) | 開発者のWeb開発知見を活用 |
| デプロイ先 | Cloudflare Workers (`@opennextjs/cloudflare` アダプタ) | Cloudflareエコシステムでの一本化希望 |
| 認証 | Clerk (`@clerk/nextjs`) | ユーザー希望 |
| DB | Cloudflare D1 (SQLite互換) + Drizzle ORM | Cloudflare完結、SQLiteベースで軽量 |
| AI (クイズQ&A自動生成) | Cloudflare Workers AI | 同一エコシステムで完結、無料枠あり、低コスト |
| 通知 | Web Push (VAPID) + Service Worker | ストア審査不要でPush通知を実現 |
| 通知トリガー | Cloudflare Cron Triggers (毎時実行) | サーバーレスでスケジュール実行 |
| PWA基盤 | `manifest.json` + Service Worker | ホーム画面追加・簡易オフライン対応 |

### 検討した代替案

- **ネイティブアプリ (iOS/Android)**: ストア審査の手間とWeb知見を活かせない点で却下
- **Vercel + 自前PostgreSQL + NextAuth**: Cloudflareエコシステム一本化の希望と合わず却下
- **OpenAI/Gemini API**: Cloudflare Workers AIで完結できるため不採用(コスト・運用の一元化を優先)

## 3. データモデル (Cloudflare D1 + Drizzle ORM)

### `users`
Clerkのユーザーと1:1で対応するアプリ内ユーザー情報。

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | アプリ内ユーザーID |
| clerk_user_id | text (unique) | Clerkのユーザー識別子 |
| notification_hour | integer | 通知を送る時刻 (0-23、ユーザーのローカル時間、デフォルト8) |
| timezone | text | 例: `Asia/Tokyo` |
| created_at | integer (unixtime) | |

### `memos`
| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | |
| user_id | text (FK → users.id) | |
| content | text | メモ本文 |
| quiz_mode | text | `ai` または `manual` |
| created_at | integer | |

### `quiz_items`
メモ1件につき1件のQ&Aを保持する(MVPではシンプルに1メモ=1クイズ)。

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | |
| memo_id | text (FK → memos.id) | |
| question | text | AI生成 or ユーザー入力 |
| answer | text | AI生成 or ユーザー入力 |
| status | text | `pending` / `ready` / `failed` (AI生成の非同期状態管理) |

### `review_cards`
SM-2アルゴリズムの状態を保持する、ユーザーごとの復習カード。

| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | |
| quiz_item_id | text (FK → quiz_items.id) | |
| user_id | text (FK → users.id) | |
| ease_factor | real | SM-2のE-Factor (初期値2.5) |
| interval_days | integer | 次回復習までの日数 |
| repetitions | integer | 連続正解回数 |
| due_date | integer (unixtime, 日単位) | 次回復習予定日 |
| last_reviewed_at | integer | 最終復習日時 |

### `push_subscriptions`
| カラム | 型 | 説明 |
|---|---|---|
| id | text (PK) | |
| user_id | text (FK → users.id) | |
| endpoint | text | |
| keys_p256dh | text | |
| keys_auth | text | |

## 4. コアフロー

### ① メモ作成 (AIモード)
1. ユーザーが本文を入力し保存 → `memos` に即座に保存し、レスポンスをユーザーに返す
2. バックグラウンドでCloudflare Workers AIを呼び出しQ&Aを生成 → `quiz_items` に `status=ready` で保存
3. 同時に `review_cards` を初期値 (`ease_factor=2.5`, `interval_days=1`, `repetitions=0`, `due_date=翌日`) で作成
4. AI生成失敗時は1回リトライ、それでも失敗なら `quiz_items.status=failed` とし、ユーザーが後から手動でQ&Aを追記できるようにする

### ① メモ作成 (手動モード)
ユーザーが本文とQ&Aを同時に入力して保存。`quiz_items.status=ready` で即時作成、以降のフローはAIモードと同じ。

### ② 通知 (Cron Trigger、毎時実行)
1. 現在のUTC時刻から各ユーザーの `timezone` を考慮し、ローカル時刻が `notification_hour` と一致するユーザーを抽出
2. 該当ユーザーの `review_cards` のうち `due_date <= 今日` の件数を集計
3. 1件以上あれば「今日n件の復習があります」という内容でWeb Push送信
4. Push送信時にendpointが410 Goneを返した場合、該当 `push_subscriptions` を削除

### ③ 復習セッション
1. 通知をタップ → `/review` を開く
2. 当日分の `due_date <= 今日` な `review_cards` を `due_date` 昇順で取得しキュー化
3. 1件ずつ「質問」を表示 → ユーザーが想起 → 「答えを見る」タップで `answer` を表示
4. ユーザーが自己評価 (もう一度 / 難しい / 普通 / 簡単) を選択
5. SM-2アルゴリズムでその場で `ease_factor` / `interval_days` / `repetitions` / `due_date` を更新
6. キューが空になったら完了画面を表示

## 5. エラーハンドリング

- AI生成の失敗はメモ保存の成否に影響させない(非同期・独立した処理として扱う)
- Push送信失敗 (410 Gone) 時は無効な購読情報を自動削除する
- オフライン時のメモ作成キューイングはMVPスコープ外とし、通信が必要な操作として扱う

## 6. テスト方針

- **SM-2アルゴリズム**: 純粋関数として実装し、間隔・ease-factorの計算をVitestでunit test網羅
- **APIルート**: `wrangler dev` + ローカルD1環境でメモ作成・クイズ生成・復習送信のintegration test
- **Push通知/Cron**: 自動テストが困難な領域のため、手動確認手順をREADMEに記載するに留める(MVPではモック送信での動作確認まで)

## 7. スコープ外 (MVPでは対応しない)

- タグ・カテゴリ分け機能
- オフライン時のメモ作成
- 1メモに複数のクイズ項目を持たせること
