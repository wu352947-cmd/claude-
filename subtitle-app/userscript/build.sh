#!/bin/sh
# 把 App 里的整页翻译核心（app/src/main/assets/yimu-web.js）打包成 Tampermonkey 脚本
cd "$(dirname "$0")"
{
  cat header.js
  echo '(function () {'
  cat pre.js
  cat ../app/src/main/assets/yimu-web.js
  cat ui.js
  echo '})();'
} > yimu-web.user.js
echo "wrote $(pwd)/yimu-web.user.js"
