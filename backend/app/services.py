"""Application services, built once at startup and shared by all requests."""

from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from eth_account import Account
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.auth import RateLimiter, SessionManager
from app.chain import Registry, RegistryClient
from app.config import Settings
from app.db import create_engine, create_sessionmaker
from app.ml.engine import Engine, TransformersEngine
from app.storage import IpfsStorage, create_storage
from app.wallets import WalletVault


@dataclass
class RateLimits:
    login_ip: RateLimiter = field(default_factory=lambda: RateLimiter(20))
    login_account: RateLimiter = field(default_factory=lambda: RateLimiter(5))
    analysis: RateLimiter = field(default_factory=lambda: RateLimiter(12))
    file_read: RateLimiter = field(default_factory=lambda: RateLimiter(120))
    chain_write: RateLimiter = field(default_factory=lambda: RateLimiter(20))
    verify: RateLimiter = field(default_factory=lambda: RateLimiter(20))


@dataclass
class Services:
    settings: Settings
    db_engine: AsyncEngine
    db: async_sessionmaker[AsyncSession]
    sessions: SessionManager
    vault: WalletVault
    ml: Engine
    storage: IpfsStorage
    registry: Registry
    limits: RateLimits = field(default_factory=RateLimits)


def build_services(settings: Settings, http: httpx.AsyncClient) -> Services:
    engine = create_engine(settings.database_url)
    operator = Account.from_key(settings.operator_private_key.get_secret_value())
    return Services(
        settings=settings,
        db_engine=engine,
        db=create_sessionmaker(engine),
        sessions=SessionManager(timedelta(hours=settings.session_ttl_hours)),
        vault=WalletVault(settings.wallet_key_bytes),
        ml=TransformersEngine(settings.model_ids, settings.device),
        storage=create_storage(settings, http),
        registry=RegistryClient(
            http, settings.chain_rpc_url, settings.contract_address, settings.chain_id, operator
        ),
    )
