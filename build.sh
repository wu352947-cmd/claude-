#!/bin/sh
# 把 src/journal.html 包成可独立打开的 index.html
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n'
  cat src/journal.html
  printf '\n</body>\n</html>\n'
} > public/index.html
