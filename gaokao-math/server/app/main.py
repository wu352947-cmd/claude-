"""启动：uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from . import bank
from .api import router
from .config import Settings, load_settings
from .core.review import make_scheduler
from .db import make_engine
from .models import utcnow

log = logging.getLogger("gaokao-math")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.engine = make_engine(settings.db_path)
        with Session(app.state.engine) as session:
            report = bank.sync_bank(session, settings.data_dir, settings.type_defaults)
        app.state.bank_report = report
        log.warning("题库同步：%d 个知识点，%d 道题", report.knowledge_points, report.questions)
        for err in report.errors:
            log.warning("题目文件有误：%s", err)
        yield
        app.state.engine.dispose()

    app = FastAPI(title="数·途", lifespan=lifespan)
    app.state.settings = settings
    app.state.scheduler = make_scheduler(settings.desired_retention)
    app.state.tz = ZoneInfo(settings.timezone)
    app.state.clock = utcnow  # 测试里可以替换成固定时间

    if settings.token:
        expected = settings.token.encode()

        @app.middleware("http")
        async def require_token(request: Request, call_next):
            if request.url.path.startswith("/api/") and request.url.path != "/api/health":
                given = request.headers.get("authorization", "").removeprefix("Bearer ").encode()
                if not hmac.compare_digest(given, expected):
                    return JSONResponse({"detail": "需要口令"}, status_code=401)
            return await call_next(request)

    app.include_router(router)

    dist = settings.web_dist
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            file = (dist / path).resolve()
            if path and file.is_file() and file.is_relative_to(dist.resolve()):
                return FileResponse(file)
            return FileResponse(dist / "index.html")

    return app
