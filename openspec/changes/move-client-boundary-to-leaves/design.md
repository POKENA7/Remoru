## Context

2026-09-12 の main で `"use client"` は 13 ファイル（サイズ順。`record-tab.tsx` は既に Server Component）:

```
17.0 KB features/memo/components/memo-detail.tsx
11.4 KB features/memo/components/memo-tab.tsx
 8.8 KB features/quiz/components/quiz-sheet.tsx
 7.6 KB features/memo/components/memo-screen.tsx
 7.0 KB features/review/components/review-tab.tsx
 6.3 KB features/notification/components/notification-settings.tsx
 4.7 KB features/tag/components/tag-suggestion-band.tsx
 4.0 KB features/sheet/sheet.tsx
 3.5 KB app/(app)/tab-bar.tsx
 3.3 KB features/first-run/components/first-run-notice.tsx
 2.9 KB features/review/components/review-screen.tsx
 1.3 KB features/memo/components/memo-detail-screen.tsx
 1.1 KB app/(app)/notification-bridge.tsx
```

Container（`app/(app)/_containers/*`）は Server Components で、`*-screen.tsx` に props を渡す。
つまり**境界は Container の直下**にあり、そこから下が全部クライアント。`stream-route-boundaries` の
後に何が変わるかは小さいので、**この design は手順を決め、対象は実装時の一覧表で確定する**。

第 12 章が挙げる Client Components の正当な理由:

1. **クライアント処理**（`useState` `useEffect` イベントハンドラ、ブラウザ API）
2. **サードパーティ**（Client 前提のライブラリ）
3. **RSC Payload の削減**（サーバーで描くと Payload が大きくなる繰り返し）

これ以外の理由で `"use client"` が付いているものは、下ろせる。

Composition パターン（第 13 章）: Client Component は Server Component を **import できない**が、
`children` や props で**受け取る**ことはできる。境界を葉へ下ろすとは、「操作を持つ小さな部品を
Client にし、表示を持つ親は Server に戻し、親が子を挟む」こと。

## Goals / Non-Goals

**Goals:**

- `"use client"` の 1 ファイルごとに理由がある。理由の無いものが 0
- `/` のクライアント JS が減る（`check:bundle`）

**Non-Goals:**

- 見た目・演出の変更

## Decisions

### D1: 最初に一覧表を作り、design に貼る。対象はそこから決める

```
| ファイル | サイズ | 理由（1/2/3/無し） | 何を葉に残すか | 下ろす順 |
```

「無し」と「1 だが操作は一部」のものが対象。理由 2・3 は触らない。

### D2: 下ろす順は「表示が大きく操作が小さい」ものから

効果（減る KB）が大きく、分けやすい。`memo-detail`（17 KB）が最初になる見込み:

```
features/memo/components/memo-detail.tsx         Server。本文・タグ・問答の表示。children を挟む
features/memo/components/memo-edit-client.tsx    編集フォーム（useActionState）
features/tag/components/tag-picker-client.tsx    タグの付け外し
features/quiz/components/quiz-sheet-client.tsx   シート（引きずり、自己採点）
```

`sheet` の引きずり（`sheet-drag.ts`）と `motion` の刷りはクライアント処理。残る。

### D3: ファイル名で境界を見える化する。検査で固定する

`"use client"` のファイルは `-client.tsx`（または `-client.ts`）で終わる。逆も然り。
`layer-boundary` に規則 6 として足し、注入で赤を確かめる（L06）。

改名は**分割と同じコミットにしない**。改名だけのコミットを先に作る（diff が読めなくなる）。

### D4: 減った量は `check:bundle` で示す。目標は前の change の実測から決める

`measure-first-paint` 以降の `docs/perf.md` の行を見て、この change の目標（KB）を最初に決め、
design に書く。届かなければ届かなかった数値を書く。**目標を後から合わせない。**

### D5: 分ける前後で振る舞いが変わらないことは E2E と spec のシナリオで見る

`.tsx` の単体テストは無い。分割の安全網は E2E スモーク（`add-e2e-smoke`）と、`memo-capture`
`quiz-editing` `tagging` `sheet` の spec のシナリオを `next dev` で辿ること（L05）。
分けた部品には、分けた**後**に単体テストが当たる（純粋な表示の部品は props → HTML で試せる）。
最低 1 つ、分けた表示部品に描画のテストを付ける（分けたことで試せるようになった証拠）。

## Risks / Trade-offs

- **`children` で挟む形にすると、props の受け渡しが増えて読みにくくなる** → 挟む深さは 1 段まで。
  2 段要る箇所は分けない（理由 1 として残す）
- **改名で `import` が一斉に変わる** → D3 の通り改名は別コミット。Biome が未使用 import を拾う

## Open Questions

- 目標の KB（D4）。前の change の実測後に決める
