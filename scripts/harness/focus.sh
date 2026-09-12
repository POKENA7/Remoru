#!/bin/bash
#
# 作業中の change を宣言する（review-with-change-context design.md D1）。
#
#   bash focus.sh <change>   宣言する（存在しない名前は拒む）
#   bash focus.sh            宣言されている値を表示する
#   bash focus.sh --resolve  読む側が使う。決められないときは何も出さずに 0 で終わる
#
# 宣言先は `.harness/focus`。`.harness/*` は gitignore 済みで worktree ごとに
# 別なので、並行して走る複数のセッションが互いの宣言を踏まない。
#
# ブランチ名から取らないのは、worktree のブランチ名が change 名と無関係だから
# である（`claude/agitated-…`）。命名規則を課すより宣言 1 行の方が確実。
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
focus_file="$root/.harness/focus"
changes_dir="$root/openspec/changes"

usage='使い方: npm run harness:focus -- <change 名>'

# 宣言 → archive を除いて 1 件だけなら採用 → 空。読む側（record-failure.sh /
# review.sh / promote-gate.mjs）はこの順で決める。
#
# 宣言された change が消えている（archive された）ときは宣言を無視して
# 落とす。古い宣言のまま別の change の失敗を数え続ける方が悪い。
resolve() {
  if [ -s "$focus_file" ]; then
    declared=$(head -n1 "$focus_file" | tr -d '[:space:]')
    if [ -n "$declared" ] && [ "$declared" != "archive" ] && [ -d "$changes_dir/$declared" ]; then
      printf '%s\n' "$declared"
      return 0
    fi
  fi
  changes=$(ls -1 "$changes_dir" 2>/dev/null | grep -v '^archive$')
  if [ "$(printf '%s\n' "$changes" | grep -c .)" = "1" ]; then
    printf '%s\n' "$changes"
  fi
}

case "${1:-}" in
  --resolve)
    resolve
    exit 0
    ;;
  "")
    if [ -s "$focus_file" ]; then
      head -n1 "$focus_file" | tr -d '[:space:]'
      echo
      exit 0
    fi
    echo "作業中の change が宣言されていない。$usage" >&2
    exit 1
    ;;
  -*)
    echo "$usage" >&2
    exit 1
    ;;
esac

name="$1"
if [ "$name" = "archive" ] || [ ! -d "$changes_dir/$name" ]; then
  {
    echo "そのような change は無い: $name"
    echo "$usage"
    ls -1 "$changes_dir" 2>/dev/null | grep -v '^archive$' | sed 's/^/  /'
  } >&2
  exit 1
fi

mkdir -p "$root/.harness"
printf '%s\n' "$name" > "$focus_file"
echo "作業中の change: $name"
