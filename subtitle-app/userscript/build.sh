#!/bin/sh
# 把 整页翻译核心（core.js）打包成 Tampermonkey 脚本
cd "$(dirname "$0")"
{
  cat header.js
  echo '(function () {'
  cat pre.js
  cat core.js
  cat ui.js
  echo '})();'
} > yimu-web.user.js
echo "wrote $(pwd)/yimu-web.user.js"
