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

NAMES='VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|CLERK_SECRET_KEY|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY|ANTHROPIC_API_KEY'
found=0

blobs() {
  git rev-list --objects --all | awk '{print $1}' |
    git cat-file --batch-check='%(objectname) %(objecttype)' 2>/dev/null |
    awk '$2=="blob"{print $1}' | sort -u
}

# 内容の規則。履歴の blob にも、これからコミットされる作業ツリーにも同じものを当てる。
# 定義が 2 か所にあるとズレるので、ここ 1 か所に置く。
rule_assign() {
  grep -aoE "($NAMES)[[:space:]]*[=:][[:space:]]*\"?[A-Za-z0-9_-]{16,}" |
    awk -F'[=:]' '{ v = $NF; if (v ~ /[A-Z]/ && v ~ /[0-9]/) print }'
}
rule_ant() {
  grep -aoE 'sk-ant-[A-Za-z0-9_-]{20,}' | awk '$0 ~ /[A-Z]/ && $0 ~ /[0-9]/'
}
rule_vapid() {
  grep -aoE '\bB[A-Za-z0-9_-]{86}\b' | awk '$0 ~ /[A-Z]/ && $0 ~ /[0-9]/'
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
  git cat-file blob "$o" 2>/dev/null | rule_assign | sed "s|^|$o |"
done)
if [ -n "$hits" ]; then
  echo "  NG: 大文字と数字を含む値がある（実鍵の形）"
  echo "$hits" | sed 's/[=:][^=:]*$/=<伏せ>/' | sed 's/^/    /'
  found=1
else
  echo "  OK: 代入はプレースホルダだけ"
fi

echo "--- 3. Anthropic の鍵の形をした裸の値が無いか ---"
# sk-ant- で始まる。名前の付いた代入でなくても拾う。
# プレースホルダの除外は検査2と同じ規則（実鍵は必ず大文字と数字を含む）を
# 使う。ここだけ規則を落とすと .env.example の sk-ant-xxxx... に一致し、
# **常に NG** になって番人として機能しなくなる。
ant=$(blobs | while read -r o; do
  git cat-file blob "$o" 2>/dev/null | rule_ant
done | sort -u)
if [ -n "$ant" ]; then
  echo "  NG: $(echo "$ant" | wc -l | tr -d ' ') 件"; found=1
else
  echo "  OK: 見つからない"
fi

echo "--- 4. VAPID 公開鍵の形をした裸の値が無いか ---"
# 未圧縮の P-256 公開鍵は 65 バイト = base64url で 87 文字、先頭は B
bare=$(blobs | while read -r o; do
  git cat-file blob "$o" 2>/dev/null | rule_vapid
done | sort -u)
if [ -n "$bare" ]; then
  echo "  NG: $(echo "$bare" | wc -l | tr -d ' ') 件"; found=1
else
  echo "  OK: 見つからない"
fi

echo "--- 5. これからコミットされる内容に鍵が入っていないか ---"
# 1〜4 の入力は git の**履歴の blob** である。コミット前の門から呼ばれたとき、
# 今まさに入ろうとしている鍵はまだ履歴に無いので 1〜4 では見つからない（L09）。
# 追跡されているファイルの現在の中身に、同じ規則を当てる。
pending=$(git ls-files 2>/dev/null | while IFS= read -r f; do
  [ -f "$f" ] || continue
  # 値そのものは**一切出さない**。検査 3・4 が件数しか出さないのと同じ理由で、
  # 門のログや failures.jsonl に実鍵が流れるのを防ぐ。出すのはファイル名だけ
  if { rule_assign < "$f"; rule_ant < "$f"; rule_vapid < "$f"; } | grep -q .; then
    printf '%s\n' "$f"
  fi
done)
if [ -n "$pending" ]; then
  echo "  NG: $(printf '%s\n' "$pending" | wc -l | tr -d ' ') 件のファイルに実鍵の形の値がある"
  printf '%s\n' "$pending" | sed 's/^/    /'
  found=1
else
  echo "  OK: 見つからない"
fi

[ $found -eq 0 ] && echo "→ 実鍵は見つからなかった"
exit $found
