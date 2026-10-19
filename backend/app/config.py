"""Runtime configuration, loaded from environment variables (or backend/.env)."""

import base64
import binascii
import re
from functools import cached_property
from typing import Annotated, Literal

from eth_utils import is_address, to_checksum_address
from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Hardhat's first development account: public, so it may only ever touch a local chain.
HARDHAT_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
LOCAL_CHAIN_ID = 31337

CommaList = Annotated[list[str], NoDecode]


def _decode_aes_key(value: SecretStr, name: str) -> SecretStr:
    try:
        raw = base64.b64decode(value.get_secret_value(), validate=True)
    except binascii.Error as exc:
        raise ValueError(f"{name} must be valid base64") from exc
    if len(raw) != 32:
        raise ValueError(f"{name} must decode to exactly 32 bytes")
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    demo_mode: bool = False

    # HTTP
    public_app_url: str = "http://localhost:3000"
    cors_origins: CommaList = ["http://localhost:3000"]
    enable_docs: bool = True

    # Accounts and sessions
    database_url: str = "sqlite+aiosqlite:///./data/medichain.db"
    session_ttl_hours: int = 12
    cookie_secure: bool = False

    # Encryption keys (base64, 32 bytes each): one for files, one for custodial wallet keys.
    encryption_key: SecretStr
    wallet_encryption_key: SecretStr

    # IPFS
    ipfs_provider: Literal["kubo", "pinata"] = "kubo"
    kubo_api_url: str = "http://127.0.0.1:5001"
    pinata_jwt: SecretStr | None = None
    pinata_gateway_url: str = "https://gateway.pinata.cloud"

    # Chain. The operator owns the registry contract and funds users' gas.
    chain_id: int = LOCAL_CHAIN_ID
    chain_rpc_url: str = "http://127.0.0.1:8545"
    contract_address: str
    operator_private_key: SecretStr
    explorer_url: str | None = None

    # Models
    brain_tumor_model: str = "Hemgg/brain-tumor-classification"
    chest_xray_model: str = "lxyuan/vit-xray-pneumonia-classification"
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"
    preload_models: bool = False

    # Uploads
    max_upload_mb: int = 10

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_commas(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("encryption_key")
    @classmethod
    def _check_encryption_key(cls, value: SecretStr) -> SecretStr:
        return _decode_aes_key(value, "ENCRYPTION_KEY")

    @field_validator("wallet_encryption_key")
    @classmethod
    def _check_wallet_key(cls, value: SecretStr) -> SecretStr:
        return _decode_aes_key(value, "WALLET_ENCRYPTION_KEY")

    @field_validator("operator_private_key")
    @classmethod
    def _check_operator_key(cls, value: SecretStr) -> SecretStr:
        if not re.fullmatch(r"0x[0-9a-fA-F]{64}", value.get_secret_value()):
            raise ValueError("OPERATOR_PRIVATE_KEY must be 0x followed by 64 hex characters")
        return value

    @field_validator("contract_address")
    @classmethod
    def _check_contract_address(cls, value: str) -> str:
        if not is_address(value):
            raise ValueError("CONTRACT_ADDRESS must be a valid Ethereum address")
        return to_checksum_address(value)

    @field_validator("pinata_jwt")
    @classmethod
    def _empty_pinata_is_none(cls, value: SecretStr | None) -> SecretStr | None:
        return value if value and value.get_secret_value() else None

    @field_validator("explorer_url")
    @classmethod
    def _strip_explorer(cls, value: str | None) -> str | None:
        return value.rstrip("/") if value else None

    @model_validator(mode="after")
    def _check_safety(self) -> "Settings":
        if self.encryption_key.get_secret_value() == self.wallet_encryption_key.get_secret_value():
            raise ValueError("ENCRYPTION_KEY and WALLET_ENCRYPTION_KEY must be different")
        dev_key = self.operator_private_key.get_secret_value().lower() == HARDHAT_DEV_KEY
        if dev_key and self.chain_id != LOCAL_CHAIN_ID:
            raise ValueError("The public Hardhat key may only be used on the local chain (31337)")
        if self.environment == "production":
            problems = [
                "DEMO_MODE must be false" if self.demo_mode else None,
                "COOKIE_SECURE must be true" if not self.cookie_secure else None,
                "OPERATOR_PRIVATE_KEY must not be the Hardhat key" if dev_key else None,
            ]
            if found := [p for p in problems if p]:
                raise ValueError("Unsafe production settings: " + "; ".join(found))
        return self

    @cached_property
    def encryption_key_bytes(self) -> bytes:
        return base64.b64decode(self.encryption_key.get_secret_value())

    @cached_property
    def wallet_key_bytes(self) -> bytes:
        return base64.b64decode(self.wallet_encryption_key.get_secret_value())

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def model_ids(self) -> dict[str, str]:
        return {"brain_tumor": self.brain_tumor_model, "chest_xray": self.chest_xray_model}
