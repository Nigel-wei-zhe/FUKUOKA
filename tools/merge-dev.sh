#!/bin/sh
# 把功能分支合回 dev：rebase、fast-forward、更新版本號、push、刪掉分支。
#
# 用法（在專案根目錄執行）：
#   sh tools/merge-dev.sh feat-a feat-b    合併多個分支，版本號只加一次
#   sh tools/merge-dev.sh                  合併目前所在的分支
#   sh tools/merge-dev.sh --dry-run feat-a 只列出會做什麼
#
# 版本號是 index.html 的 APP_VERSION：日期.當天第幾次（例如 2026.10.16.1），用台灣日期。
# rebase 有衝突時會停下來，dev 和分支都不會被改到。
set -eu

DRY=''
if [ "${1:-}" = '--dry-run' ]; then DRY=1; shift; fi

die() { echo "✗ $*" >&2; exit 1; }
run() { if [ -n "$DRY" ]; then echo "  (dry-run) $*"; else "$@"; fi; }

# 在目前所在的 repo 執行（不是腳本所在的資料夾），測試時才不會動到別的 repo
cd "$(git rev-parse --show-toplevel)" || die '要在 git repo 裡執行'
[ -z "$(git status --porcelain)" ] || die '有還沒 commit 的變更，先 commit 或收起來（git stash）'

if [ $# -eq 0 ]; then
  cur=$(git rev-parse --abbrev-ref HEAD)
  case "${cur}" in dev|main) die "目前在 ${cur}，請指定要合併的分支" ;; esac
  set -- "${cur}"
fi
for b in "$@"; do
  case "${b}" in dev|main) die "不能合併 ${b}" ;; esac
  git rev-parse --verify -q "refs/heads/${b}" >/dev/null || die "找不到本機分支 ${b}"
done

echo '→ 更新 dev'
git fetch -q origin
git checkout -q dev
git merge -q --ff-only origin/dev || die 'dev 和 origin/dev 分岔了，先手動處理'
before=$(git rev-parse HEAD)

for b in "$@"; do
  echo "→ 合併 ${b}"
  if ! git merge-base --is-ancestor dev "${b}"; then
    if [ -n "$DRY" ]; then
      echo "  (dry-run) git rebase dev ${b}"
    elif ! git rebase -q dev "${b}"; then
      git rebase --abort
      git checkout -q dev
      die "${b} rebase 到 dev 有衝突，已還原。手動解完衝突再跑一次"
    fi
    git checkout -q dev
  fi
  run git merge -q --ff-only "${b}"
done

# 版本號：同一天就加 1，換天從 1 開始
today=$(TZ=Asia/Taipei date +%Y.%m.%d)
old=$(sed -n "s/.*const APP_VERSION = '\([^']*\)'.*/\1/p" index.html)
case "${old}" in
  "${today}".*) n=$(( ${old##*.} + 1 )) ;;
  *) n=1 ;;
esac
ver="${today}.${n}"
echo "→ 版本號 ${old} → ${ver}"
if [ -z "$DRY" ]; then
  sed -i.bak "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${ver}'/" index.html && rm index.html.bak
  node tools/check-trip.mjs >/dev/null || die 'trip.json 檢查沒過：node tools/check-trip.mjs 看錯誤，修好再 commit 版本號'
  git commit -q -am "版本號 ${ver}"
fi

# 改了快取優先的檔案卻沒加 sw.js 的 VERSION，已安裝的手機不會更新
changed=$(git diff --name-only "$before" HEAD)
if echo "$changed" | grep -qE '^(fonts|icons|vendor)/|^manifest\.webmanifest$' && ! echo "$changed" | grep -qx 'sw.js'; then
  echo '⚠ 改了字型、圖示、Leaflet 或 manifest，但 sw.js 的 VERSION 沒加 1'
fi

echo '→ push dev'
run git push -q origin dev

echo '→ 刪除分支'
for b in "$@"; do
  if [ -n "$DRY" ] || git merge-base --is-ancestor "${b}" dev; then
    run git branch -q -D "${b}"
    if git ls-remote --exit-code --heads origin "${b}" >/dev/null 2>&1; then
      run git push -q origin --delete "${b}"
    fi
  else
    echo "⚠ ${b} 沒有完整合進 dev，沒有刪"
  fi
done
[ -n "$DRY" ] || git fetch -q --prune origin

echo "✓ 完成：版本 ${ver}，GitHub Pages 幾分鐘後更新"
