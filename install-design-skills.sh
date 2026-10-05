#!/usr/bin/env bash
# 一键安装热门设计系统 Skill。
# 用法: ./install-design-skills.sh [--user | --project]   (默认 --project)
#   --user     安装到 ~/.claude/skills（本机所有项目可用）
#   --project  安装到 ./.claude/skills（仅当前仓库）
set -euo pipefail
MODE="${1:---project}"
case "$MODE" in
  --user) DEST="$HOME/.claude/skills" ;;
  --project) DEST="$(pwd)/.claude/skills" ;;
  *) echo "未知参数: $MODE"; exit 1 ;;
esac
mkdir -p "$DEST"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "==> 1/3 Anthropic 官方设计类 skills"
git clone --depth 1 https://github.com/anthropics/skills "$TMP/anthropic"
for s in frontend-design theme-factory brand-guidelines canvas-design web-artifacts-builder; do
  rm -rf "$DEST/$s"; cp -r "$TMP/anthropic/skills/$s" "$DEST/$s" && echo "   + $s"
done

echo "==> 2/3 UI UX Pro Max"
git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill "$TMP/uiux"
if [ -d "$TMP/uiux/.claude/skills" ]; then
  cp -r "$TMP/uiux/.claude/skills/." "$DEST/" && echo "   + ui-ux-pro-max (来自仓库 .claude/skills)"
else
  echo "   ! 仓库结构有变，请改用: npm install -g ui-ux-pro-max-cli && uipro init --ai claude"
fi

echo "==> 3/3 Awesome Design Skills（按需挑选风格）"
echo "   运行: npx typeui.sh list   然后: npx typeui.sh pull <风格名>"

echo "完成，安装位置: $DEST（重启 Claude Code 后生效）"
