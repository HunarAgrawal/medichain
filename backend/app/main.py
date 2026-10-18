"""Application factory. Run with: uvicorn app.main:create_app --factory"""

import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.chain import ChainError, RecordsContract
from app.config import Settings
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
# Per-request INFO logs from these libraries add noise (and IPFS/RPC URLs) to every request.
_NOISY_LOGGERS = ("httpx", "httpx2", "huggingface_hub", "transformers")


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
            app.state.services = services
            yield
            return
        timeout = httpx.Timeout(60.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
            app.state.services = build_services(settings, http)
            await _check_chain(app.state.services)
            if settings.preload_models:
                await run_in_threadpool(app.state.services.engine.preload)
            logger.info("Medichain API ready (IPFS: %s)", settings.ipfs_provider)
            yield

    docs_enabled = settings.enable_docs
    app = FastAPI(
        title="Medichain API",
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition", "Retry-After"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.perf_counter()
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Content-Security-Policy", _API_CSP)
        # Log the route template, never the concrete path: it can contain a patient ID.
        route = getattr(request.scope.get("route"), "path", "-")
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "%s %s -> %s (%.0f ms)", request.method, route, response.status_code, elapsed_ms
        )
        return response

    register_error_handlers(app)
    app.include_router(api_router)
    return app


async def _check_chain(services: Services) -> None:
    if not isinstance(services.records, RecordsContract):
        return
    try:
        chain_id = await services.records.chain_id()
    except ChainError as exc:
        logger.warning("Blockchain RPC unreachable at startup: %s", exc)
        return
    if chain_id != services.settings.chain_id:
        logger.warning(
            "RPC chain id %s does not match CHAIN_ID=%s", chain_id, services.settings.chain_id
        )
