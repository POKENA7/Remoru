#!/usr/bin/env bash
# OpenCode Go のモデルに実装と修正を任せる。
#
#   scripts/delegate.sh impl <change> <notes.md> [model]   notes の範囲を実装させる
#   scripts/delegate.sh fix  <change> <notes.md> [model]   直前の実装セッションの続きで修正させる
#
# <change> は openspec/changes/ 以下の変更名（フォルダのパスを渡してもよい）。
# <notes.md> には、その回にやるタスクの範囲と注意点を監督役が書く。
#
# 全ログは .delegate/logs/ に残し、標準出力には要約（使った道具・最後の報告・費用）だけを出す。
# 既定モデルは環境変数 DELEGATE_IMPL_MODEL で変えられる。
# DELEGATE_TIMEOUT_MIN（既定 30）分を過ぎたら打ち切る。
#
# レビューはここでは行わない。`HARNESS_REVIEW_RUNNER=opencode npm run harness:review` が
# 受領書を作る唯一の経路である（二重に回すと費用が倍になる）。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

IMPL_MODEL="${DELEGATE_IMPL_MODEL:-opencode-go/deepseek-v4.1-flash}"
TIMEOUT_MIN="${DELEGATE_TIMEOUT_MIN:-30}"

# 先頭のコメントだけを使い方として出す。
usage() {
  while IFS= read -r line; do
    [[ "$line" == "#"* ]] || break
    line="${line#\#}"
    printf '%s\n' "${line# }"
  done < <(tail -n +2 "$0")
  exit 1
}

role="${1:-}"; change="${2:-}"
[[ -n "$role" && -n "$change" ]] || usage
case "$role" in
  impl|fix) ;;
  *) usage ;;
esac

notes="${3:-}"
[[ -n "$notes" ]] || usage
[[ -f "$notes" ]] || { echo "notes file not found: $notes" >&2; exit 1; }

name="$(basename "${change%/}")"
dir="openspec/changes/$name"
[[ -f "$dir/tasks.md" ]] || { echo "change not found (tasks.md がない): $dir" >&2; exit 1; }
mkdir -p .delegate/logs .delegate/sessions
session_file=".delegate/sessions/$name.impl"
args=(--auto --format json --title "$role: $name")

case "$role" in
  impl)
    model="${4:-$IMPL_MODEL}"
    prompt="あなたは実装担当です。CLAUDE.md と .learnings/active.md を読み、OpenSpec の変更 $name（$dir/）のうち、$notes に書かれた範囲を openspec-apply-change スキルの手順で実装してください。終えたタスクだけに tasks.md でチェックを付けてください（L08。タスク本文の検証条件を満たしたときだけ完了にする）。"
    ;;
  fix)
    model="${4:-$IMPL_MODEL}"
    prompt="あなたは実装担当です。OpenSpec の変更 $name（$dir/）の実装について、$notes の指摘を直してください。CLAUDE.md と .learnings/active.md に従ってください。"
    if [[ -f "$session_file" ]]; then args+=(--session "$(cat "$session_file")"); fi
    ;;
esac

log=".delegate/logs/$(date +%Y%m%d-%H%M%S)-$name-$role.jsonl"
echo "[$role] $model  change=$name  log=$log"

opencode run -m "$model" "${args[@]}" "$prompt" >"$log" 2>"$log.err" &
pid=$!
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
while kill -0 "$pid" 2>/dev/null; do
  if (( $(date +%s) > deadline )); then
    kill "$pid" 2>/dev/null || true
    echo "!! ${TIMEOUT_MIN} 分を超えたので打ち切りました"
    break
  fi
  sleep 5
done
wait "$pid" 2>/dev/null && status=0 || status=$?

session="$(jq -r 'select(.sessionID) | .sessionID' "$log" 2>/dev/null | head -1)"
if [[ -n "$session" ]]; then echo "$session" >"$session_file"; fi

echo "--- 使った道具 ---"
jq -r 'select(.type=="tool_use") | .part as $p
  | "\($p.tool) [\($p.state.status)] \($p.state.input.command // $p.state.input.path // $p.state.input.filePath // $p.state.input.pattern // "" | tostring | .[0:120])"' "$log" 2>/dev/null \
  | uniq -c | sed 's/^ *//' | tail -60
echo "--- 最後の報告 ---"
jq -rs '[.[] | select(.type=="text") | .part.text] | last // "(報告なし)"' "$log" 2>/dev/null
echo "--- 結果 ---"
jq -rs '"費用 $\([.[] | select(.type=="step_finish") | .part.cost // 0] | add // 0 | . * 10000 | round / 10000)"' "$log" 2>/dev/null
echo "exit=$status session=${session:-?}"
[[ -s "$log.err" ]] && { echo "--- stderr (末尾) ---"; tail -5 "$log.err"; }
exit "$status"
