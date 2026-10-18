from fastapi import APIRouter, Request

from app.deps import ServicesDep, client_ip, enforce_rate_limit
from app.schemas import ChallengeRequest, ChallengeResponse, SessionResponse, VerifyRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/challenge")
def create_challenge(
    body: ChallengeRequest, request: Request, services: ServicesDep
) -> ChallengeResponse:
    """Return a one-time message for the wallet to sign (valid for 5 minutes)."""
    enforce_rate_limit(services.limits.sign_in, client_ip(request))
    challenge = services.auth.create_challenge(body.address)
    return ChallengeResponse(
        nonce=challenge.nonce, message=challenge.message, expires_at=challenge.expires_at
    )


@router.post("/session")
def create_session(body: VerifyRequest, request: Request, services: ServicesDep) -> SessionResponse:
    """Exchange a signed challenge for a short-lived bearer token."""
    enforce_rate_limit(services.limits.sign_in, client_ip(request))
    session = services.auth.verify_signature(body.nonce, body.signature)
    return SessionResponse(
        token=session.token, address=session.address, expires_at=session.expires_at
    )
