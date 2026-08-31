#!/bin/bash
#
# コミット対象の差分のハッシュを出す。門（precommit-gate.sh）と
# レビュー（review.sh）が**同じ値**を出す必要があるので、1 か所に置く。
#
# パイプで渡すのは、`$(git diff)` が末尾の改行を落とすため。落ちた側と
# 落ちていない側で別のハッシュになり、受領書が永久に一致しなくなる。
set -u

cd "${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}" || exit 1

sha() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -d' ' -f1
  else
    sha256sum | cut -d' ' -f1
  fi
}

if git diff --cached --quiet 2>/dev/null; then
  git diff HEAD | sha
else
  git diff --cached | sha
fi
