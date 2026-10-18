"""Application services, built once at startup and shared by all requests."""

from dataclasses import dataclass, field
from datetime import timedelta

import httpx

from app.auth import RateLimiter, WalletAuth
from app.chain import RecordsContract, RecordsReader
from app.config import Settings
from app.ml.engine import Engine, TransformersEngine
from app.storage import IpfsStorage, create_storage


@dataclass
class RateLimits:
    sign_in: RateLimiter = field(default_factory=lambda: RateLimiter(20))
    analysis: RateLimiter = field(default_factory=lambda: RateLimiter(10))
    file_read: RateLimiter = field(default_factory=lambda: RateLimiter(60))


@dataclass
class Services:
    settings: Settings
    auth: WalletAuth
    engine: Engine
    storage: IpfsStorage
    records: RecordsReader
    limits: RateLimits = field(default_factory=RateLimits)


def build_auth(settings: Settings) -> WalletAuth:
    return WalletAuth(
        secret=settings.jwt_secret.get_secret_value(),
        token_ttl=timedelta(minutes=settings.jwt_ttl_minutes),
        app_url=settings.public_app_url,
        chain_id=settings.chain_id,
        allowed_wallets=settings.allowed_wallets,
    )


def build_services(settings: Settings, http: httpx.AsyncClient) -> Services:
    return Services(
        settings=settings,
        auth=build_auth(settings),
        engine=TransformersEngine(settings.model_ids, settings.device),
        storage=create_storage(settings, http),
        records=RecordsContract(http, settings.chain_rpc_url, settings.contract_address),
    )
