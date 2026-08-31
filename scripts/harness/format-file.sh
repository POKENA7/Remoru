#!/bin/bash
#
# PostToolUse（Edit / Write）で走る整形（design.md D2 / D3）。
#
# 触った 1 ファイルだけを `biome check --write` する。全体を見ない。
# 編集のたびに数秒待たされる設計は、いずれ disableAllHooks で外される（制約 4）。
#
# **必ず exit 0 で終わる。** PostToolUse は tool の実行後に走るのでそもそも
# 阻止できず、ここで stderr を出しても LLM の文脈を食うだけになる。整形は
# 判断の余地が無いので、黙って直す（D3）。
set -u

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# 対象外は何もしない。.md や .json をここで整形すると、Write の直後に
# 中身が変わって LLM の持っている像とズレる
case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

[ -f "$file" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
npx --no-install biome check --write "$file" >/dev/null 2>&1

exit 0
