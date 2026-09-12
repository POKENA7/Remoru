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
#
# 差分だけでは「タスクの主張と実装の不一致」を判断できない（L08 がまさにそれ
# だった）ので、作業中の change の tasks.md と spec の delta を添える
# （review-with-change-context D2）。作業中の change が決められないときは
# **受領書を作らずに落ちる**（D3。fail closed）。
#
#   bash review.sh             レビューする
#   bash review.sh --dry-run   組み立てたプロンプトを出して終わる（モデルを呼ばない）
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
cd "$root" || exit 1

dry_run=false
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=true
fi

model="${HARNESS_REVIEW_MODEL:-claude-sonnet-5}"
hash=$(bash "$(dirname "$0")/diff-hash.sh")
if [ -z "$hash" ]; then
  echo "レビュー: 差分のハッシュを計算できなかった。" >&2
  exit 1
fi

# `reviews.md` は差分からも外す（D6）。ハッシュから外すだけだと、指摘を受けて
# やり直すたびに**前回の所見がレビュー対象として積み上がる**。レビューが自分の
# 出力を読み返すことになり、プロンプトも毎回伸びる。除外は diff-hash.sh と同じ
exclude=':(exclude)openspec/changes/*/reviews.md'

if git diff --cached --quiet 2>/dev/null; then
  diff=$(git diff HEAD -- . "$exclude")
else
  diff=$(git diff --cached -- . "$exclude")
fi

if [ -z "$diff" ]; then
  echo "レビュー: 差分が無い。" >&2
  exit 1
fi

# --- 作業中の change（D1 / D3）---
#
# 宣言 → archive を除いて 1 件だけなら採用 → 空。空のときレビューは落ちる。
# 「どれでもいいから 1 つ」を選ぶと、別の change の tasks.md を添えてレビューさせる
# ことになり、指摘が的外れになるだけでなく**的外れだと気づけない**
change=$(HARNESS_ROOT="$root" bash "$(dirname "$0")/focus.sh" --resolve)
if [ -z "$change" ]; then
  {
    echo "レビュー: どの change を作業中か決められない。受領書は作らない。"
    echo "  次を実行してから、もう一度 npm run harness:review を実行すること:"
    echo "    npm run harness:focus -- <change 名>"
    ls -1 "$root/openspec/changes" 2>/dev/null | grep -v '^archive$' | sed 's/^/      /'
  } >&2
  exit 1
fi

change_dir="$root/openspec/changes/$change"
tasks_file="$change_dir/tasks.md"
reviews_file="$change_dir/reviews.md"

prompt=$(
  cat <<'PROMPT'
以下は Remoru（Next.js / Cloudflare Workers / D1）のコミット前の差分である。
**正しさ**の欠陥だけを探すこと。整形と一般的な lint は Biome が別に見ているので、
様式の指摘は挙げない。

見るもの: 抜けた await、取り違えた条件、境界値、利用者ごとの分離の破れ、
資源の解放漏れ、検査が緑のまま何も守っていない状態、タスクの主張と実装の不一致。

**ファイルを直してはならない。指摘するだけである。** 出力は **JSON だけ**で、
前後に説明を付けない。承認を求めたり、修正案を実行しようとしたりしない。

{"findings":[{"file":"...","line":0,"summary":"..."}],"body":"<全体の所見を数行で。この文言をそのまま返さない>"}

欠陥が無ければ findings は空配列にする。確信が持てないものは挙げない。

以下に、この差分が属する change のタスクと spec を添える。
- [x] のタスクのうち、差分に対応する実装かテストが無いものは findings に挙げる。
PROMPT
  printf '\n--- change: %s のタスク（tasks.md）---\n' "$change"
  if [ -f "$tasks_file" ]; then
    cat "$tasks_file"
  else
    echo "（tasks.md が無い）"
  fi

  # spec の delta。無い change（skip_specs）もあるので、無いことは異常ではない
  specs=$(find "$change_dir/specs" -name 'spec.md' 2>/dev/null | sort)
  if [ -n "$specs" ]; then
    printf '%s\n' "$specs" | while IFS= read -r spec; do
      printf '\n--- spec: %s ---\n' "${spec#"$change_dir/"}"
      cat "$spec"
    done
  fi

  printf '\n--- 差分 ---\n'
  printf '%s\n' "$diff"
)

if [ "$dry_run" = true ]; then
  printf '%s\n' "$prompt"
  exit 0
fi

# レビューの所見を change の中に残す（D4）。`.harness/` の受領書は差分に紐づく
# 使い捨てで、コミットすると消える。**findings があったときも残す**——見つけた
# 指摘こそ、あとから「何を見て何を見逃したか」を読み返す値打ちがある
append_review() {
  {
    printf '\n## %s  hash=%s  findings=%s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$hash" "$1"
    printf '%s\n' "$2"
    if [ -n "${3:-}" ]; then
      printf '\n%s\n' "$3"
    fi
  } >> "$reviews_file"
  # 書いたら自分で index に載せる（D6）。載せないと「ステージした後に変わった」と
  # 見なされ、門が部分ステージとして止める。ハッシュは reviews.md を数えないので、
  # ここで index が動いても受領書は無効にならない
  git add -- "$reviews_file" 2>/dev/null || true
}

# 書き込み系のツールを禁じる。レビューは**読んで指摘するだけ**で、直すのは実装側の
# 仕事である。禁じないと「直す承認をくれ」と返してきて JSON にならない（実際に起きた）
raw=$(printf '%s' "$prompt" |
  claude -p --model "$model" --output-format json \
    --disallowedTools "Edit,Write,NotebookEdit,Bash" 2>&1)
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

# 「JSON だけ」と指示しても、前置き・```json のフェンス・後書きが付いて返ることが
# ある（実際に "Confirmed. Output:" が前に付いた）。最初の `{` から最後の `}` までを
# 取り出す。取り出せなければ受領書は作らない側に倒れるので、緩めても門は開かない
json=$(printf '%s' "$text" | node -e '
  let s = "";
  process.stdin.on("data", (d) => { s += d; }).on("end", () => {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a < 0 || b < a) process.exit(1);
    process.stdout.write(s.slice(a, b + 1));
  });
')

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
  list=$(printf '%s' "$findings" | jq -r '.[] | "- \(.file):\(.line // 0) \(.summary)"')
  append_review "$count" "$body" "$list"
  echo "レビュー: $count 件の指摘がある。受領書は作らない。" >&2
  printf '%s\n' "$list" | sed 's/^- /  - /' >&2
  echo "  所見は ${reviews_file#"$root/"} に残した。" >&2
  exit 1
fi

append_review 0 "$body"

mkdir -p "$root/.harness/reviews"
jq -n \
  --arg hash "$hash" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson findings "$findings" \
  --arg body "$body" \
  '{hash: $hash, ts: $ts, findings: $findings, body: $body}' \
  > "$root/.harness/reviews/$hash.json"

echo "レビュー: 指摘なし。受領書 .harness/reviews/$hash.json を作った。"
echo "  所見は ${reviews_file#"$root/"} に残した。"
