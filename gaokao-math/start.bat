@echo off
chcp 65001 >nul
cd /d "%~dp0server"
where uv >nul 2>nul
if errorlevel 1 (
  echo 第一次使用：正在安装 uv（Python 环境管理工具）……
  powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
echo 正在启动，第一次会下载依赖，请稍等……
start "" cmd /c "timeout /t 6 >nul & start http://localhost:8000"
uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
pause
