#!/bin/bash
cd "$(dirname "$0")/server" || exit 1
if ! command -v uv >/dev/null 2>&1; then
  echo "第一次使用：正在安装 uv（Python 环境管理工具）……"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi
echo "正在启动，第一次会下载依赖，请稍等……"
( sleep 6; (open http://localhost:8000 || xdg-open http://localhost:8000) >/dev/null 2>&1 ) &
exec uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
