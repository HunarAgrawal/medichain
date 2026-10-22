"""Application factory. Run with: uvicorn app.main:create_app --factory"""

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.chain import ChainError
from app.config import Settings
from app.db import init_db
from app.errors import register_error_handlers
from app.routes import api_router
from app.services import Services, build_services

logger = logging.getLogger("app")

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}
_API_CSP = "default-src 'none'; frame-ancestors 'none'"
_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Browsers only send custom headers cross-origin after a CORS preflight we control, so
# requiring one on state-changing requests blocks CSRF even if a cookie leaks cross-site.
CSRF_HEADER = "X-Requested-With"
# Per-request INFO logs from these libraries add noise (and IPFS/RPC URLs) to every request.
_NOISY_LOGGERS = ("httpx", "httpx2", "huggingface_hub", "transformers", "aiosqlite")


def create_app(settings: Settings | None = None, services: Services | None = None) -> FastAPI:
    settings = settings or (services.settings if services else Settings())
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    for noisy in _NOISY_LOGGERS:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if services is not None:
            await _start(app, services)
            yield
            await services.db_engine.dispose()
            return
        timeout = httpx.Timeout(60.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
            built = build_services(settings, http)
            await _start(app, built)
            await _check_chain(built)
            if settings.preload_models:
                await run_in_threadpool(built.ml.preload)
            logger.info("Medichain API ready (IPFS: %s)", settings.ipfs_provider)
            yield
            await built.db_engine.dispose()

    docs_enabled = settings.enable_docs
    app = FastAPI(
        title="Medichain API",
        version="0.3.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", CSRF_HEADER],
        expose_headers=["Content-Disposition", "Retry-After"],
        max_age=600,
    )

    @app.middleware("http")
    async def guard(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        is_api = request.url.path.startswith("/api/")
        if is_api and request.method in _UNSAFE_METHODS and CSRF_HEADER not in request.headers:
            response: Response = JSONResponse(
                {"detail": "Missing X-Requested-With header."}, status_code=403
            )
        else:
            response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if is_api:
            response.headers.setdefault("Content-Security-Policy", _API_CSP)
        # Log the route template, never the concrete path.
        route = getattr(request.scope.get("route"), "path", "-")
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "%s %s -> %s (%.0f ms)", request.method, route, response.status_code, elapsed_ms
        )
        return response

    register_error_handlers(app)
    app.include_router(api_router)
    return app


async def _start(app: FastAPI, services: Services) -> None:
    await init_db(services.db_engine)
    async with services.db() as db:
        await services.sessions.purge_expired(db)
        await db.commit()
    app.state.services = services


async def _check_chain(services: Services) -> None:
    try:
        status = await services.registry.status()
    except ChainError as exc:
        logger.warning("Blockchain RPC unreachable at startup: %s", exc)
        return
    if status.owner != status.operator:
        logger.warning("OPERATOR_PRIVATE_KEY does not own the registry at CONTRACT_ADDRESS")
