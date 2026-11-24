"""Encrypted file storage: IPFS through a local Kubo node or Pinata, or a local directory.

Every stored file is already sealed with AES-GCM, so the provider only ever sees ciphertext.
"""

import asyncio
import hashlib
import json
import os
import re
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Protocol

import httpx

from app.config import Settings

MAX_FETCH_BYTES = 64 * 1024 * 1024
_CID = re.compile(r"Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,120}")
_LOCAL_ID = re.compile(r"sha256-([0-9a-f]{64})")


class StorageError(Exception):
    """Storage is unreachable or returned something unexpected."""


def validate_cid(cid: str) -> str:
    if not _CID.fullmatch(cid):
        raise StorageError(f"Invalid CID: {cid!r}")
    return cid


class Storage(Protocol):
    async def add(self, data: bytes, filename: str) -> str: ...

    async def cat(self, cid: str) -> bytes: ...

    async def ping(self) -> str: ...


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

    async def ping(self) -> str:
        try:
            response = await self._client.post(f"{self._api}/api/v0/version")
            response.raise_for_status()
            return f"Kubo {response.json()['Version']}"
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise StorageError(f"Kubo unreachable: {exc}") from exc


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

    async def ping(self) -> str:
        try:
            response = await self._client.get(
                "https://api.pinata.cloud/data/testAuthentication", headers=self._headers
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise StorageError(f"Pinata unreachable: {exc}") from exc
        return "Pinata authenticated"


class LocalStorage:
    """Content-addressed files in a local directory, for single-server and on-premises installs."""

    def __init__(self, root: str) -> None:
        self._root = Path(root)

    async def add(self, data: bytes, filename: str) -> str:
        digest = hashlib.sha256(data).hexdigest()
        await asyncio.to_thread(self._write, digest, data)
        return f"sha256-{digest}"

    async def cat(self, cid: str) -> bytes:
        match = _LOCAL_ID.fullmatch(cid)
        if match is None:
            raise StorageError(f"Invalid local file ID: {cid!r}")
        path = self._path(match.group(1))
        try:
            if path.stat().st_size > MAX_FETCH_BYTES:
                raise StorageError("Stored file exceeds the size limit")
            return await asyncio.to_thread(path.read_bytes)
        except OSError as exc:
            raise StorageError(f"Local file unavailable: {exc}") from exc

    async def ping(self) -> str:
        try:
            self._root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StorageError(f"Local storage unavailable: {exc}") from exc
        if not os.access(self._root, os.W_OK):
            raise StorageError("Local storage is not writable")
        return "Local encrypted file store"

    def _path(self, digest: str) -> Path:
        return self._root / digest[:2] / digest

    def _write(self, digest: str, data: bytes) -> None:
        path = self._path(digest)
        if path.exists():
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(".partial")
            partial.write_bytes(data)
            partial.replace(path)
        except OSError as exc:
            raise StorageError(f"Local write failed: {exc}") from exc


def create_storage(settings: Settings, client: httpx.AsyncClient) -> Storage:
    if settings.storage_provider == "local":
        return LocalStorage(settings.storage_dir)
    if settings.storage_provider == "pinata":
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
