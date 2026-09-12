#!/bin/bash
#
# change を 1 つ、herdr の専用 worktree で Claude Code に始めさせる。
#
#   scripts/spawn-change.sh <change 名> [--dry-run]
#
# herdr 0.7.3 の CLI に合わせてある（`herdr worktree create --json` の出力形と
# `herdr pane run` を 2026-09-12 に使い捨てのリポジトリで実測した）。
# 版が上がって `herdr agent prompt` などが増えても、この形は動き続ける。
#
# やること:
#   1. origin/main を取り、change/<名> のブランチで worktree を作る
#      （置き場は herdr の既定 ~/.herdr/worktrees/<repo>/<branch>。リポジトリの外なので、
#        入れ子の checkout を biome や vitest が拾う問題が起きない）
#   2. その worktree で npm ci（本体と cron-worker）と .env.local の複製を**この script が同期で**行う
#      （pane の中で走らせると、終わるのを待たずに claude を起動してしまう）
#   3. プロンプトを worktree の .harness/prompt.md（gitignore 済み）に書き、
#      root pane で `claude "$(cat .harness/prompt.md)"` を打つ
#
# --dry-run は、プロンプトと打つコマンドを表示するだけで何も作らない。
#
# 前提: herdr のサーバーが動いている（`herdr session list`）。`claude` が PATH にある。
set -euo pipefail

change="${1:-}"
mode="${2:-}"
if [ -z "$change" ] || { [ -n "$mode" ] && [ "$mode" != "--dry-run" ]; }; then
  echo "usage: scripts/spawn-change.sh <change> [--dry-run]" >&2
  exit 1
fi

repo=$(git rev-parse --show-toplevel)
if [ ! -d "$repo/openspec/changes/$change" ]; then
  echo "change が無い: openspec/changes/$change" >&2
  exit 1
fi
branch="change/$change"

# ---- プロンプト ------------------------------------------------------------

# change ごとの追記。無いものは共通部だけ
extra=""
case "$change" in
  measure-first-paint)
    extra='- Chrome DevTools の MCP（web-perf skill）で測る。無ければ最初に私に設定を頼む。実機の計測は私に依頼する' ;;
  add-staging-environment)
    extra='- wrangler はこのマシンでログイン済み。**本番 worker と本番 D1 には一切触らない。** 4.1 のトークン登録は私がやる' ;;
  add-e2e-smoke)
    extra='- Clerk のテスト利用者は私が作る。1.3 で資格情報を依頼して待つ。`check:e2e` を `check` に入れない' ;;
  enforce-layer-boundaries)
    extra='- 既存の tests/architecture/layers.arch.test.ts に足す。新規ファイルは作らない。`check:build` が無ければ自分で足す（design Open Questions）' ;;
  review-with-change-context)
    extra='- review.sh を壊すと全セッションがコミットできなくなる。`--dry-run` と注入テストを先に' ;;
  lighten-first-paint)
    extra='- `/account` の見た目はモックで確認を取ってから作る（L11）。効果は段ごとに測り、効かない段は revert する（L13）' ;;
  stream-route-boundaries)
    extra='- 骨格と「一覧とタグの帯を分けるか」はモックで聞いてから作る（L11）。staleTimes は案 1 で足りれば入れない' ;;
esac

prompt=$(cat <<EOF
/opsx:apply $change

役割: あなたは実装者。設計は openspec/changes/$change/design.md に決めてある。
始める前に \`git fetch origin && git log --oneline HEAD..origin/main\` で main との差を見る（L14）。
次に docs/nextjs-rework-plan.md と、この change の proposal / design / tasks を読む。

守ること:
- design の Decisions は変えない。変えたくなったら design の Open Questions に理由を書いて止まり、私に聞く
- tasks に「人が行う」「利用者に」とある項目は、必要な情報をまとめて私に依頼し、届くまで待つ。代わりにやらない
- 触ってよいのは proposal の Impact 表にあるファイルだけ。他の change の領域（openspec/changes/ の他の change）は触らない
- 検査を書いたら、違反を注入して赤くなることを確かめてから採用する（L06）。tasks にその結果を書く
- tasks の [x] は、本文の検証条件を満たしたときだけ付ける（L08）
- 5 セッションが並列で動いている。main が進んだら git rebase origin/main してから npm run check
$extra

終了条件: tasks が全部 [x] / npm run check が緑 / npm run harness:review の受領書 / ブランチ $branch にコミット済み / PR を作る。
merge と archive はしない（私が順番に merge する）。
完了報告には、実測した数値、design に追記したこと、私に判断や作業が要ることを書く。
EOF
)

if [ "$mode" = "--dry-run" ]; then
  echo "== branch: $branch"
  echo "== prompt:"
  printf '%s\n' "$prompt"
  echo "== commands:"
  echo "herdr worktree create --cwd $repo --branch $branch --base origin/main --no-focus --json"
  echo "(cd <path> && npm ci && npm ci --prefix cron-worker && cp $repo/.env.local .env.local)"
  echo 'herdr pane run <root pane> '"'"'claude "$(cat .harness/prompt.md)"'"'"
  exit 0
fi

# ---- worktree ----------------------------------------------------------------

git -C "$repo" fetch -q origin

# 途中で落ちたら worktree とブランチを片付ける。残すと、次に同じ change を打ったとき
# `herdr worktree create` が同じブランチで衝突し、手で消すまで再試行できない。
# create 自体が途中で失敗した場合や応答が読めなかった場合（ws が空）は git 側から直接消す
ws=""; pane=""; path=""
rollback() {
  echo "途中で失敗した。worktree とブランチを片付ける: ${path:-?} / $branch" >&2
  if [ -n "$ws" ]; then
    herdr worktree remove --workspace "$ws" --force --json >/dev/null 2>&1 || true
  else
    p=$(git -C "$repo" worktree list --porcelain | awk -v b="refs/heads/$branch" '$1=="worktree"{w=$2} $1=="branch"&&$2==b{print w}')
    if [ -n "$p" ]; then git -C "$repo" worktree remove --force "$p" >/dev/null 2>&1 || true; fi
  fi
  git -C "$repo" branch -D "$branch" >/dev/null 2>&1 || true
}
# ここから claude の起動までは、どこで失敗・中断しても片付ける（Ctrl-C を含む）
trap 'rollback; exit 1' INT TERM ERR

out=$(herdr worktree create --cwd "$repo" --branch "$branch" --base origin/main --no-focus --json)
ws=$(printf '%s' "$out" | jq -r '.result.workspace.workspace_id // empty' 2>/dev/null || true)
pane=$(printf '%s' "$out" | jq -r '.result.root_pane.pane_id // empty' 2>/dev/null || true)
path=$(printf '%s' "$out" | jq -r '.result.worktree.path // empty' 2>/dev/null || true)
if [ -z "$ws" ] || [ -z "$pane" ] || [ -z "$path" ] || [ ! -d "$path" ]; then
  echo "herdr worktree create の応答が読めない:" >&2
  printf '%s\n' "$out" >&2
  rollback
  exit 1
fi
echo "worktree: $path（workspace $ws, pane $pane）"

# ---- 依存と環境（同期で）------------------------------------------------------

(
  cd "$path"
  npm ci --no-audit --no-fund
  npm ci --prefix cron-worker --no-audit --no-fund
  if [ -f "$repo/.env.local" ]; then command cp "$repo/.env.local" .env.local; fi
  mkdir -p .harness
  printf '%s\n' "$prompt" > .harness/prompt.md
)

# ---- 起動 ------------------------------------------------------------------------

# pane run は「コマンド文字列 + Enter」を root pane の shell に打つ。
# 引用符は pane 側の shell が解釈するので、ここでは単一引用で包んだまま渡す。
herdr pane run "$pane" 'claude "$(cat .harness/prompt.md)"'
trap - INT TERM ERR
echo "started: $change → herdr workspace $ws（$branch）"
echo "様子を見る: herdr agent list / herdr pane read $pane --source recent-unwrapped --lines 60"
