#!/bin/bash
#
# 全履歴に実鍵が入っていないかを見る。**このリポジトリは public** なので、
# 一度入った鍵は削除ではなく再発行が必要になる。入る前に見つける。
#
#   bash scripts/scan-secrets.sh
#
# 「言及」と「実値」を区別する必要がある。名前が出てくるだけの文書
# （docs/deploy.md など）や、プレースホルダを書いた *.example は無害。
# 実鍵は必ず大文字と数字を含むので、**小文字と記号だけの値は
# プレースホルダとみなす**。この規則だと `sk_test_replace_me` のような
# 書き方も通せる（x の並びだけを除外していたときは誤検知した）。
set -u

NAMES='VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
found=0

blobs() {
  git rev-list --objects --all | awk '{print $1}' |
    git cat-file --batch-check='%(objectname) %(objecttype)' 2>/dev/null |
    awk '$2=="blob"{print $1}' | sort -u
}

echo "--- 1. env ファイルが履歴に入っていないか ---"
leaked=$(git log --all --diff-filter=A --name-only --pretty=format: |
  sort -u | grep -E '(^|/)\.(env|dev\.vars)' | grep -vE '\.example$')
if [ -n "$leaked" ]; then
  echo "  NG:"; echo "$leaked" | sed 's/^/    /'; found=1
else
  echo "  OK: *.example 以外は無い"
fi

echo "--- 2. 鍵の代入に実値が入っていないか ---"
hits=$(blobs | while read -r o; do
  git cat-file blob "$o" 2>/dev/null |
    grep -aoE "($NAMES)[[:space:]]*[=:][[:space:]]*\"?[A-Za-z0-9_-]{16,}" |
    sed "s|^|$o |"
done | awk -F'[=:]' '{ v = $NF; if (v ~ /[A-Z]/ && v ~ /[0-9]/) print }')
if [ -n "$hits" ]; then
  echo "  NG: 大文字と数字を含む値がある（実鍵の形）"
  echo "$hits" | sed 's/[=:][^=:]*$/=<伏せ>/' | sed 's/^/    /'
  found=1
else
  echo "  OK: 代入はプレースホルダだけ"
fi

echo "--- 3. VAPID 公開鍵の形をした裸の値が無いか ---"
# 未圧縮の P-256 公開鍵は 65 バイト = base64url で 87 文字、先頭は B
bare=$(blobs | while read -r o; do
  git cat-file blob "$o" 2>/dev/null | grep -aoE '\bB[A-Za-z0-9_-]{86}\b'
done | sort -u)
if [ -n "$bare" ]; then
  echo "  NG: $(echo "$bare" | wc -l | tr -d ' ') 件"; found=1
else
  echo "  OK: 見つからない"
fi

[ $found -eq 0 ] && echo "→ 実鍵は見つからなかった"
exit $found
