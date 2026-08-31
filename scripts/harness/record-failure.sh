#!/bin/bash
#
# 検査の失敗を機械が記録する（design.md D8）。LLM は書かない。
#
#   bash record-failure.sh <check id> <exit code> <phase> < stderr
#
# 1 行 1 件で .learnings/failures.jsonl に追記する。JSONL にするのは追記が
# 競合しないため。JSON 配列だと読み書きが要り、並行実行で壊れる。
#
# `check:secrets` の失敗では head を記録しない。scan-secrets.sh 側で値は
# 出さないようにしてあるが、public リポジトリなので二重に防ぐ。
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
check="${1:-unknown}"
code="${2:-1}"
phase="${3:-unknown}"

# stdin は必ず読み切る。読まずに終わると呼び元が SIGPIPE で落ちる
input=$(cat)
head_line=""
if [ "$check" != "check:secrets" ]; then
  # 先頭の**空でない** 1 行。vitest は 1 行目が空行なので、素直に head -1 すると
  # 何も残らない（実際に head が "" の行が 1 件記録された）
  head_line=$(printf '%s\n' "$input" | grep -m1 -v '^[[:space:]]*$' | cut -c1-300)
fi

# 作業中の change。archive を除いた openspec/changes 直下が**ちょうど 1 件**の
# ときだけ採用する。複数あるとき先頭を選ぶと、落ちていない change に失敗が
# 積み上がり、D9 のしきい値が別の change で立つ／立たないという取り違えになる。
# 分からないときは null にする（null 同士でまとまるので、数え漏れにはならない）
changes=$(ls -1 "$root/openspec/changes" 2>/dev/null | grep -v '^archive$')
if [ "$(printf '%s\n' "$changes" | grep -c .)" = "1" ]; then
  change="$changes"
else
  change=""
fi

mkdir -p "$root/.learnings"
jq -cn \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg check "$check" \
  --argjson exit "$code" \
  --arg head "$head_line" \
  --arg change "$change" \
  --arg phase "$phase" \
  '{ts: $ts, check: $check, exit: $exit, head: $head, change: (if $change == "" then null else $change end), phase: $phase}' \
  >> "$root/.learnings/failures.jsonl"
