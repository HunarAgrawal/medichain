"""HTTP routers, mounted under /api/v1."""

from fastapi import APIRouter

from app.routes import admin, auth, people, studies, system, verify

api_router = APIRouter(prefix="/api/v1")
for module in (system, auth, studies, people, admin, verify):
    api_router.include_router(module.router)
