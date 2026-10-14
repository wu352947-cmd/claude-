"""启动：uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from . import ai_api, bank, exam_api
from .ai.llm import OpenAICompatClient
from .api import router
from .backup import backup_now
from .blueprint import load_blueprint
from .config import Settings, load_settings
from .core.review import make_scheduler
from .db import make_engine
from .models import KnowledgePoint, utcnow

log = logging.getLogger("gaokao-math")

# 不需要口令的接口：健康检查；配图（<img> 没法带口令头，文件名是内容哈希，猜不到）
PUBLIC_PREFIXES = ("/api/health", "/api/figures/")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            if path := backup_now(settings.db_path, settings.backup_dir, settings.backup_keep):
                log.warning("已自动备份数据库：%s", path)
        except OSError as exc:
            log.warning("自动备份失败：%s", exc)
        app.state.engine = make_engine(settings.db_path)
        with Session(app.state.engine) as session:
            report = bank.sync_bank(session, settings.data_dir, settings.type_defaults)
            kp_ids = {k.id for k in session.exec(select(KnowledgePoint).where(KnowledgePoint.active))}
        app.state.bank_report = report
        app.state.blueprint = load_blueprint(settings.data_dir / "exam_blueprint.yaml", kp_ids)
        log.warning("题库同步：%d 个知识点，%d 道题；试卷结构：%s", report.knowledge_points, report.questions,
                    app.state.blueprint.name)
        for err in report.errors:
            log.warning("题目文件有误：%s", err)
        yield
        app.state.engine.dispose()

    app = FastAPI(title="数·途", lifespan=lifespan)
    app.state.settings = settings
    app.state.scheduler = make_scheduler(settings.desired_retention)
    app.state.tz = ZoneInfo(settings.timezone)
    app.state.clock = utcnow  # 测试里可以替换成固定时间
    app.state.text_llm = OpenAICompatClient(settings.llm) if settings.llm.enabled else None
    app.state.vision_llm = OpenAICompatClient(settings.vision) if settings.vision.enabled else None

    if settings.token:
        expected = settings.token.encode()

        @app.middleware("http")
        async def require_token(request: Request, call_next):
            path = request.url.path
            if path.startswith("/api/") and not path.startswith(PUBLIC_PREFIXES):
                given = request.headers.get("authorization", "").removeprefix("Bearer ").encode()
                if not hmac.compare_digest(given, expected):
                    return JSONResponse({"detail": "需要口令"}, status_code=401)
            return await call_next(request)

    app.include_router(router)
    app.include_router(exam_api.router)
    app.include_router(ai_api.router)

    dist = settings.web_dist
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            file = (dist / path).resolve()
            if path and file.is_file() and file.is_relative_to(dist.resolve()):
                headers = {"Cache-Control": "no-cache"} if path in ("sw.js", "manifest.webmanifest") else None
                return FileResponse(file, headers=headers)
            return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})

    return app
