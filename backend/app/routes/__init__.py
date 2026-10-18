"""HTTP routers, mounted under /api/v1."""

from fastapi import APIRouter

from app.routes import analyses, auth, records, system

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(analyses.router)
api_router.include_router(records.router)
