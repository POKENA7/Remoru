#!/bin/bash
#
# コミット前のレビュー（design.md D7）。受領書 .harness/reviews/H.json を作る
# **唯一の**経路である。
#
# 門（precommit-gate.sh）は受領書の有無しか見ない。ここが壊れたときに起きるのは
# 「受領書が作れない」であり、門は閉じたままになる（D6 の fail closed）。
#
# 実行系は `claude -p`。D7 の第 1 候補をタスク 6.1 で実測して採用した。
# 既定モデルが古い CLI では 404 になるため、モデルは明示して渡す。
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
cd "$root" || exit 1

model="${HARNESS_REVIEW_MODEL:-claude-sonnet-5}"
hash=$(bash "$(dirname "$0")/diff-hash.sh")
if [ -z "$hash" ]; then
  echo "レビュー: 差分のハッシュを計算できなかった。" >&2
  exit 1
fi

if git diff --cached --quiet 2>/dev/null; then
  diff=$(git diff HEAD)
else
  diff=$(git diff --cached)
fi

if [ -z "$diff" ]; then
  echo "レビュー: 差分が無い。" >&2
  exit 1
fi

prompt=$(
  cat <<'PROMPT'
以下は Remoru（Next.js / Cloudflare Workers / D1）のコミット前の差分である。
**正しさ**の欠陥だけを探すこと。整形と一般的な lint は Biome が別に見ているので、
様式の指摘は挙げない。

見るもの: 抜けた await、取り違えた条件、境界値、利用者ごとの分離の破れ、
資源の解放漏れ、検査が緑のまま何も守っていない状態、タスクの主張と実装の不一致。

出力は **JSON だけ**。前後に説明を付けない。

{"findings":[{"file":"...","line":0,"summary":"..."}],"body":"全体の所見を数行で"}

欠陥が無ければ findings は空配列にする。確信が持てないものは挙げない。

--- 差分 ---
PROMPT
  printf '%s\n' "$diff"
)

raw=$(printf '%s' "$prompt" | claude -p --model "$model" --output-format json 2>&1)
if [ -z "$raw" ]; then
  echo "レビュー: claude -p から応答が無かった。受領書は作らない。" >&2
  exit 1
fi

text=$(printf '%s' "$raw" | jq -er 'if .is_error then empty else .result end' 2>/dev/null)
if [ -z "$text" ]; then
  echo "レビュー: claude -p が失敗した。受領書は作らない。" >&2
  printf '%s\n' "$raw" | head -c 800 >&2
  echo >&2
  exit 1
fi

# ```json ... ``` で包まれて返ることがあるので剥がす
json=$(printf '%s' "$text" | sed -e 's/^```json//' -e 's/^```//' -e 's/```$//')

# `.findings` が配列であることまで確かめる。`jq -c '.findings'` は欠けていても
# 文字列 "null" を返し、`jq 'length'` は null に 0 を返す。型を見ないと、
# 壊れた応答が「指摘 0 件」になって受領書が書かれ、門が静かに開く（fail open）
findings=$(printf '%s' "$json" | jq -c 'select((.findings | type) == "array") | .findings' 2>/dev/null)
if [ -z "$findings" ]; then
  echo "レビュー: 応答に findings の配列が無い。受領書は作らない。" >&2
  printf '%s\n' "$text" | head -c 800 >&2
  echo >&2
  exit 1
fi

count=$(printf '%s' "$findings" | jq 'length')
body=$(printf '%s' "$json" | jq -r '.body // ""')

if [ "$count" != "0" ]; then
  echo "レビュー: $count 件の指摘がある。受領書は作らない。" >&2
  printf '%s' "$findings" | jq -r '.[] | "  - \(.file):\(.line // 0) \(.summary)"' >&2
  exit 1
fi

mkdir -p "$root/.harness/reviews"
jq -n \
  --arg hash "$hash" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson findings "$findings" \
  --arg body "$body" \
  '{hash: $hash, ts: $ts, findings: $findings, body: $body}' \
  > "$root/.harness/reviews/$hash.json"

echo "レビュー: 指摘なし。受領書 .harness/reviews/$hash.json を作った。"
