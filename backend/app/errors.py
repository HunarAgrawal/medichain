"""Map domain errors to HTTP responses without leaking internals."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.chain import ChainError, ContractRejected
from app.crypto import IntegrityError
from app.ml.engine import ModelUnavailableError
from app.storage import StorageError

logger = logging.getLogger(__name__)

# (status code, public message) per infrastructure error.
_ERROR_RESPONSES: dict[type[Exception], tuple[int, str]] = {
    IntegrityError: (502, "The stored file failed its integrity check."),
    StorageError: (502, "File storage is unavailable. Please try again."),
    ChainError: (503, "The blockchain network is unavailable. Please try again."),
    ModelUnavailableError: (503, "The analysis model is unavailable. Please try again later."),
}

# Contract custom errors that can reach a user, with a status and a plain-language message.
_CONTRACT_ERRORS: dict[str, tuple[int, str]] = {
    "AccessDenied": (403, "You do not have access to this record."),
    "NotClinician": (403, "This clinician is not verified on the registry."),
    "RecordNotFound": (404, "No on-chain record exists for this study."),
    "RecordAlreadyExists": (409, "This study has already been published."),
    "DuplicateReport": (409, "An identical report is already registered."),
    "InvalidAddress": (422, "That account cannot be used here."),
}


def register_error_handlers(app: FastAPI) -> None:
    for error_type, (status_code, message) in _ERROR_RESPONSES.items():
        app.add_exception_handler(error_type, _handler(status_code, message))
    app.add_exception_handler(ContractRejected, _contract_rejected)
    app.add_exception_handler(Exception, _unexpected)


def _handler(status_code: int, message: str):
    async def handle(request: Request, exc: Exception) -> JSONResponse:
        logger.warning("%s on %s: %s", type(exc).__name__, _route(request), exc)
        return JSONResponse({"detail": message}, status_code=status_code)

    return handle


async def _contract_rejected(request: Request, exc: Exception) -> JSONResponse:
    name = exc.error_name if isinstance(exc, ContractRejected) else "unknown"
    status_code, message = _CONTRACT_ERRORS.get(name, (502, "The registry rejected the request."))
    logger.warning("Contract rejected %s on %s", name, _route(request))
    return JSONResponse({"detail": message}, status_code=status_code)


async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", _route(request), exc_info=exc)
    return JSONResponse({"detail": "Internal server error."}, status_code=500)


def _route(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", request.url.path)
