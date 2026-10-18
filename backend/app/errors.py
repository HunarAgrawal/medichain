"""Map domain errors to HTTP responses without leaking internals."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.auth import AuthError, WalletNotAllowedError
from app.chain import AccessDeniedError, ChainError, RecordNotFoundError
from app.crypto import IntegrityError
from app.ml.engine import ModelUnavailableError
from app.storage import StorageError

logger = logging.getLogger(__name__)

# (status code, public message). A ``None`` message means the exception text is user-safe.
_ERROR_RESPONSES: dict[type[Exception], tuple[int, str | None]] = {
    WalletNotAllowedError: (403, None),
    AuthError: (401, None),
    AccessDeniedError: (403, "You do not have access to this record."),
    RecordNotFoundError: (404, "No record exists for this patient ID."),
    IntegrityError: (502, "The stored file failed its integrity check."),
    StorageError: (502, "File storage is unavailable. Please try again."),
    ChainError: (503, "The blockchain node is unavailable. Please try again."),
    ModelUnavailableError: (503, "The analysis model is unavailable. Please try again later."),
}


def register_error_handlers(app: FastAPI) -> None:
    for error_type, (status_code, public_message) in _ERROR_RESPONSES.items():
        app.add_exception_handler(error_type, _handler(status_code, public_message))
    app.add_exception_handler(Exception, _unexpected)


def _handler(status_code: int, public_message: str | None):
    async def handle(request: Request, exc: Exception) -> JSONResponse:
        if status_code >= 500:
            logger.warning("%s on %s: %s", type(exc).__name__, _route(request), exc)
        headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
        return JSONResponse(
            {"detail": public_message or str(exc)}, status_code=status_code, headers=headers
        )

    return handle


async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", _route(request), exc_info=exc)
    return JSONResponse({"detail": "Internal server error."}, status_code=500)


def _route(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", request.url.path)
