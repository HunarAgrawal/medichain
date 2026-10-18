"""IPFS pinning and retrieval through a local Kubo node or Pinata."""

import json
import re
from contextlib import AbstractAsyncContextManager
from typing import Protocol

import httpx

from app.config import Settings

MAX_FETCH_BYTES = 64 * 1024 * 1024
_CID = re.compile(r"Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,120}")


class StorageError(Exception):
    """IPFS is unreachable or returned something unexpected."""


def validate_cid(cid: str) -> str:
    if not _CID.fullmatch(cid):
        raise StorageError(f"Invalid CID: {cid!r}")
    return cid


class IpfsStorage(Protocol):
    async def add(self, data: bytes, filename: str) -> str: ...

    async def cat(self, cid: str) -> bytes: ...


class KuboStorage:
    def __init__(self, client: httpx.AsyncClient, api_url: str) -> None:
        self._client = client
        self._api = api_url.rstrip("/")

    async def add(self, data: bytes, filename: str) -> str:
        try:
            response = await self._client.post(
                f"{self._api}/api/v0/add",
                params={"pin": "true", "cid-version": "1"},
                files={"file": (filename, data, "application/octet-stream")},
            )
            response.raise_for_status()
            return validate_cid(response.json()["Hash"])
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise StorageError(f"Kubo add failed: {exc}") from exc

    async def cat(self, cid: str) -> bytes:
        request = self._client.stream(
            "POST", f"{self._api}/api/v0/cat", params={"arg": validate_cid(cid)}
        )
        return await _read_limited(request)


class PinataStorage:
    PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"

    def __init__(self, client: httpx.AsyncClient, jwt: str, gateway_url: str) -> None:
        self._client = client
        self._headers = {"Authorization": f"Bearer {jwt}"}
        self._gateway = gateway_url.rstrip("/")

    async def add(self, data: bytes, filename: str) -> str:
        try:
            response = await self._client.post(
                self.PIN_URL,
                headers=self._headers,
                files={"file": (filename, data, "application/octet-stream")},
                data={
                    "pinataOptions": json.dumps({"cidVersion": 1}),
                    "pinataMetadata": json.dumps({"name": filename}),
                },
            )
            response.raise_for_status()
            return validate_cid(response.json()["IpfsHash"])
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise StorageError(f"Pinata upload failed: {exc}") from exc

    async def cat(self, cid: str) -> bytes:
        request = self._client.stream("GET", f"{self._gateway}/ipfs/{validate_cid(cid)}")
        return await _read_limited(request)


def create_storage(settings: Settings, client: httpx.AsyncClient) -> IpfsStorage:
    if settings.ipfs_provider == "pinata":
        if settings.pinata_jwt is None:
            raise ValueError("PINATA_JWT is required when IPFS_PROVIDER=pinata")
        return PinataStorage(
            client, settings.pinata_jwt.get_secret_value(), settings.pinata_gateway_url
        )
    return KuboStorage(client, settings.kubo_api_url)


async def _read_limited(request: AbstractAsyncContextManager[httpx.Response]) -> bytes:
    try:
        async with request as response:
            response.raise_for_status()
            buffer = bytearray()
            async for chunk in response.aiter_bytes():
                buffer.extend(chunk)
                if len(buffer) > MAX_FETCH_BYTES:
                    raise StorageError("Stored file exceeds the size limit")
            return bytes(buffer)
    except httpx.HTTPError as exc:
        raise StorageError(f"IPFS fetch failed: {exc}") from exc
