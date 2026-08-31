#!/bin/bash
#
# PreToolUse（Bash）の門（design.md D5 / D6）。`git commit` のときだけ働く。
#
#   1. 検査を全部走らせる。1 つでも落ちたら exit 2（落ちた検査名を stderr に出す）
#   2. 差分のハッシュ H を計算し、.harness/reviews/H.json が無い、または
#      findings が空でないなら exit 2
#
# matcher は Bash で、`if` フィルタは使わない。ドキュメントが `if` の Bash
# パターン照合を best-effort と明記しているため、門の判定を預けない（D5）。
# 判定できない入力（JSON が読めない等）は**落とす側**に倒す。
#
# 受領書を差分のハッシュに紐づけるのは、レビュー後に手を入れたら無効に
# するため。ファイルの有無だけを見ると、1 回通せば以後は素通りになる。
set -u

root="${HARNESS_ROOT:-${CLAUDE_PROJECT_DIR:-$PWD}}"
payload=$(cat)

if ! cmd=$(printf '%s' "$payload" | jq -er '.tool_input.command // ""' 2>/dev/null); then
  echo "門: 入力を読めなかった。素通りさせずに止める（D5）。" >&2
  exit 2
fi

case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "$root" || {
  echo "門: $root へ移動できなかった。" >&2
  exit 2
}

# 検査は**作業ツリー**を見るが、コミットされるのは **index** である。
#
# 落とすのは**部分ステージ**のときだけ。index に何か載っていて、なお未ステージの
# 変更が残っている状態では、コミットされる木（index）と検査が見た木（作業ツリー）が
# 別物になる。
#
# 何もステージされていないときは落とさない。`git commit -a` はコミットの時点で
# 作業ツリーを取り込むので、コミットされる木は検査が見た木と一致する。
# 受領書のハッシュも、そのときは `git diff HEAD`（＝作業ツリー）で計算している。
#
# 判定はファイル単位の対応を取らない。検査はリポジトリ全体を走査するので、
# コミット対象と無関係なファイルの未ステージ変更も「検査が見た木」に含まれる。
# 対応を取って絞ると、絞り漏れが**静かに素通りする**側に出る（制約 2）。
if ! git diff --cached --quiet 2>/dev/null && ! git diff --quiet 2>/dev/null; then
  {
    echo "門: 部分ステージのままコミットしようとしている。検査は作業ツリーを見るので、"
    echo "    このままでは検査が一度も見ていない木がコミットされる。"
    echo "    git add で揃えてからやり直すこと（対象外のファイルでも止まる。粗いのは意図的）。"
    git diff --name-only
  } >&2
  exit 2
fi

# 検査名は package.json からそのまま読む。門の中に検査を定義しない（D1）
checks=$(jq -r '.scripts | keys[] | select(startswith("check:"))' package.json 2>/dev/null)
if [ -z "$checks" ]; then
  echo "門: package.json から check:* を読めなかった。" >&2
  exit 2
fi

for check in $checks; do
  if ! out=$(npm run --silent "$check" 2>&1); then
    printf '%s\n' "$out" | bash "$(dirname "$0")/record-failure.sh" "$check" 2 precommit
    {
      echo "門: $check が落ちた。コミットできない。"
      printf '%s\n' "$out" | tail -30
    } >&2
    exit 2
  fi
done

# --- レビューの受領書 ---

hash=$(bash "$(dirname "$0")/diff-hash.sh")
if [ -z "$hash" ]; then
  echo "門: 差分のハッシュを計算できなかった。" >&2
  exit 2
fi

receipt="$root/.harness/reviews/$hash.json"
if [ ! -f "$receipt" ]; then
  echo "門: この差分（$hash）のレビュー受領書が無い。npm run harness:review を実行すること。" >&2
  exit 2
fi

# 型まで見る。findings が無い受領書は `.findings | length` が 0 を返すので、
# 型を確かめないと壊れた受領書で門が開く
findings=$(jq -r 'if (.findings | type) == "array" then (.findings | length) else "型不正" end' \
  "$receipt" 2>/dev/null)
if [ "$findings" != "0" ]; then
  echo "門: 受領書に findings が ${findings:-?} 件ある。直してから npm run harness:review をやり直すこと。" >&2
  exit 2
fi

exit 0
