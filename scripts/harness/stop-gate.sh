#!/bin/bash
#
# Stop hook（design.md D4）。ターンの終わりに 1 回だけ走る。
#
#   stop_hook_active が true      → 何もしない（再入。既に一度止めている）
#   git status --porcelain が空   → 何もしない（読むだけのターン）
#   check:types / check:test 失敗 → exit 2 で終了を拒む
#
# 再入の判定を入れないと、直せない失敗で無限に回り続ける。差分が無いときに
# 走らせないのは、質問に答えただけのターンで毎回テストが走ると外されるため（制約 4）。
#
# exit 2 のときの stderr は、そのまま LLM への指示になる。
#
# HARNESS_ROOT は検査する場所の差し替え口。注入テスト（stop-gate.test.ts）が
# 使う。既定では Claude Code が渡すプロジェクト直下を見る。
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
payload=$(cat)

# 読めない入力は「再入ではない」側に倒す。素通りさせない（制約 2）
active=$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
[ "$active" = "true" ] && exit 0

cd "$root" || exit 0
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0

for check in check:types check:test; do
  if ! out=$(npm run --silent "$check" 2>&1); then
    {
      echo "ターンを終える前に $check が落ちている。直してから終えること。"
      printf '%s\n' "$out" | tail -30
    } >&2
    exit 2
  fi
done

exit 0
