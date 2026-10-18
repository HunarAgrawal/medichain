"""Runtime configuration, loaded from environment variables (or backend/.env)."""

import base64
import binascii
from functools import cached_property
from typing import Annotated, Literal

from eth_utils import is_address, to_checksum_address
from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

CommaList = Annotated[list[str], NoDecode]


def _split_commas(value: object) -> object:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    # HTTP
    cors_origins: CommaList = ["http://localhost:5173"]
    public_app_url: str = "http://localhost:5173"
    enable_docs: bool = True

    # Wallet sign-in
    jwt_secret: SecretStr
    jwt_ttl_minutes: int = 60
    allowed_wallets: CommaList = []

    # Encryption at rest (base64-encoded 32-byte AES key)
    encryption_key: SecretStr

    # IPFS
    ipfs_provider: Literal["kubo", "pinata"] = "kubo"
    kubo_api_url: str = "http://127.0.0.1:5001"
    pinata_jwt: SecretStr | None = None
    pinata_gateway_url: str = "https://gateway.pinata.cloud"

    # Chain
    chain_id: int = 31337
    chain_rpc_url: str = "http://127.0.0.1:8545"
    contract_address: str

    # Models
    brain_tumor_model: str = "Hemgg/brain-tumor-classification"
    chest_xray_model: str = "lxyuan/vit-xray-pneumonia-classification"
    device: Literal["auto", "cpu", "cuda", "mps"] = "auto"
    preload_models: bool = False

    # Uploads
    max_upload_mb: int = 10

    _split_cors = field_validator("cors_origins", mode="before")(_split_commas)

    @field_validator("allowed_wallets", mode="before")
    @classmethod
    def _normalize_wallets(cls, value: object) -> object:
        value = _split_commas(value)
        if not isinstance(value, list):
            return value
        for address in value:
            if not is_address(address):
                raise ValueError(f"ALLOWED_WALLETS contains an invalid address: {address}")
        return [to_checksum_address(address) for address in value]

    @field_validator("jwt_secret")
    @classmethod
    def _check_jwt_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return value

    @field_validator("encryption_key")
    @classmethod
    def _check_encryption_key(cls, value: SecretStr) -> SecretStr:
        try:
            raw = base64.b64decode(value.get_secret_value(), validate=True)
        except binascii.Error as exc:
            raise ValueError("ENCRYPTION_KEY must be valid base64") from exc
        if len(raw) != 32:
            raise ValueError("ENCRYPTION_KEY must decode to exactly 32 bytes")
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

    @cached_property
    def encryption_key_bytes(self) -> bytes:
        return base64.b64decode(self.encryption_key.get_secret_value())

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def model_ids(self) -> dict[str, str]:
        return {"brain_tumor": self.brain_tumor_model, "chest_xray": self.chest_xray_model}
