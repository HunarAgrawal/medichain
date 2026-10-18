"""Read-only access to the MediChainRecords contract over JSON-RPC.

Calls set ``from`` to the signed-in wallet, so the contract's own ``msg.sender`` access
check decides who may read a record. The backend never holds a private key.
"""

from dataclasses import dataclass
from typing import Protocol

import httpx
from eth_abi import decode, encode
from eth_utils import keccak, to_checksum_address


def _selector(signature: str) -> bytes:
    return keccak(text=signature)[:4]


class ChainError(Exception):
    """The RPC node is unreachable or the contract call failed unexpectedly."""


class RecordNotFoundError(Exception):
    pass


class AccessDeniedError(Exception):
    pass


_GET_RECORD = _selector("getRecord(string)")
_RECORD_EXISTS = _selector("recordExists(string)")
_REVERTS: dict[bytes, type[Exception]] = {
    _selector("RecordNotFound()"): RecordNotFoundError,
    _selector("AccessDenied()"): AccessDeniedError,
}


@dataclass(frozen=True)
class OnChainRecord:
    owner: str
    created_at: int
    scan_cid: str
    report_cid: str


class RecordsReader(Protocol):
    async def record_exists(self, patient_id: str) -> bool: ...

    async def get_record(self, patient_id: str, caller: str) -> OnChainRecord: ...


class RecordsContract:
    def __init__(self, client: httpx.AsyncClient, rpc_url: str, address: str) -> None:
        self._client = client
        self._rpc_url = rpc_url
        self._address = to_checksum_address(address)

    async def record_exists(self, patient_id: str) -> bool:
        result = await self._call(_RECORD_EXISTS + encode(["string"], [patient_id]))
        (exists,) = decode(["bool"], result)
        return bool(exists)

    async def get_record(self, patient_id: str, caller: str) -> OnChainRecord:
        result = await self._call(_GET_RECORD + encode(["string"], [patient_id]), sender=caller)
        owner, created_at, scan_cid, report_cid = decode(
            ["address", "uint64", "string", "string"], result
        )
        return OnChainRecord(to_checksum_address(owner), int(created_at), scan_cid, report_cid)

    async def chain_id(self) -> int:
        return int(await self._rpc("eth_chainId", []), 16)

    async def _call(self, data: bytes, sender: str | None = None) -> bytes:
        tx = {"to": self._address, "data": "0x" + data.hex()}
        if sender:
            tx["from"] = sender
        result = await self._rpc("eth_call", [tx, "latest"])
        if not isinstance(result, str) or result in ("", "0x"):
            raise ChainError("Contract returned no data. Check CONTRACT_ADDRESS and CHAIN_RPC_URL.")
        return bytes.fromhex(result.removeprefix("0x"))

    async def _rpc(self, method: str, params: list[object]) -> object:
        payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        try:
            response = await self._client.post(self._rpc_url, json=payload)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ChainError(f"RPC request failed: {exc}") from exc
        if "error" in body:
            raise _revert_error(body["error"])
        return body.get("result")


def _revert_error(error: dict[str, object]) -> Exception:
    # Nodes nest revert data differently: {"data": "0x.."} or {"data": {"data": "0x.."}}.
    data = error.get("data")
    if isinstance(data, dict):
        data = data.get("data")
    if isinstance(data, str) and len(data) >= 10:
        error_type = _REVERTS.get(bytes.fromhex(data[2:10]))
        if error_type is not None:
            return error_type()
    return ChainError(f"Contract call reverted: {error.get('message', 'unknown error')}")
