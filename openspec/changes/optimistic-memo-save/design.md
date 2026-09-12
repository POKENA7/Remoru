## Context

`server-actions-for-writes` の後の保存の流れ（`features/memo/components/memo-tab.tsx`）:

```
<form action={formAction}>  →  useActionState  →  saveMemo (actions.ts)
  → createMemo → startGeneration（waitUntil）→ refresh() → { ok, memoId }
  → useEffect が state.memoId を見て onSaved(memoId) → fresh が立つ → 刷りの演出
```

一覧の取り直しは action の `refresh()` が同梱して返す（`server-actions-for-writes` D5）。
`fresh`（`features/memo/fresh-memo.ts`）は「いま書いた 1 件」の合図で、同一性を保って 1 回だけ刷る。

`memo-capture` spec: 「反映の演出が保存そのものを遅らせては MUST NOT ならない。行は直ちに現れ、
演出はその上で起こる」「新しく加わった行だけを演出の対象とする」。

## Decisions

### D1: `useOptimistic` で仮の行を先頭に置く。刷りの合図は仮の行の出現

```
押す → addOptimistic({ id: "optimistic-<time>", content, review: generating, tags: [] })
     → 仮の行が先頭に現れる → fresh を仮の id で立てる → 刷りの演出
action が返る → refresh() の結果で本物の行に入れ替わる → 仮の行は React が消す
             → fresh は仮の id を指したまま → 本物の id と一致しないので**再実行されない**
失敗（ok: false）→ 仮の行は自動で消える → 本文を入力欄に戻す → エラーを操作した場所に出す
```

**同一性の扱いがこの change の核心。** 仮の行と本物の行は id が違うので、演出は仮の行で 1 回だけ
起きる。本物の行に入れ替わったときに**もう一度刷らない**ことを検査で固定する。

### D2: 仮の行の見た目は「作成中」の行と同じ

タグ無し・復習の状態は `generating`。本物の行も保存直後は同じ状態なので、入れ替わっても
見た目が変わらない。**モックで確認を取る**（L11）——ただし本物の「作成中」の行と同じなら、
モックは既存の行の見た目を示すだけで足りる。

### D3: 下書き（`sessionStorage`）は action の成功で消す。失敗では残す

いまと同じ。楽観的にしても、下書きを消すのは成功が返ってからにする。仮の行が出た時点で
消すと、失敗したときに本文が戻せない。

### D4: 検査

- 仮の行が押した瞬間に出る（action の解決前に DOM にある）
- 演出が 1 回だけ（`fresh` が仮の id で立ち、本物の id では立たない）
- 失敗で仮の行が消え、本文が入力欄に戻る

action を失敗させて赤、戻して緑（L06）。E2E スモーク（`add-e2e-smoke`）が緑。

## Risks / Trade-offs

- **仮の行と本物の行の高さが違うと一覧が跳ねる** → 本文は同じなので高さは同じ。タグは両方無し
- **`useOptimistic` は `startTransition` の中で呼ぶ必要がある** → `<form action>` は自動で
  transition の中。手で呼ぶ経路が無いことを確かめる

## Open Questions

- `memo-tab.tsx` の中で `memos` を持っているのは `memo-screen.tsx`（`fresh` と一覧の両方が要る）。
  `useOptimistic` をどちらに置くかは、`move-client-boundary-to-leaves` で部品が割れた後に決める
