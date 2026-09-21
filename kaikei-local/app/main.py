"""FastAPI アプリ本体."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, config
from .db import init_db
from .routers import entries, evidence, invoices, masters, reports


def create_app() -> FastAPI:
    config.ensure_dirs()
    init_db()
    app = FastAPI(title="kaikei-local", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.include_router(masters.router)
    app.include_router(entries.router)
    app.include_router(evidence.router)
    app.include_router(invoices.router)
    app.include_router(reports.router)

    @app.exception_handler(ValueError)
    async def _value_error(_: Request, exc: ValueError):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    app.mount("/static", StaticFiles(directory=str(config.STATIC_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def index():
        return FileResponse(str(config.STATIC_DIR / "index.html"))

    @app.get("/health", include_in_schema=False)
    async def health():
        return {"ok": True, "version": __version__}

    return app


app = create_app()
