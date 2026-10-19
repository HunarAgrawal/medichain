"""The MediChainRegistry contract over JSON-RPC.

Reads use ``eth_call``; reads that depend on ``msg.sender`` run *from* the user's address.
Writes are signed locally with the acting user's custodial key and broadcast raw, so each
on-chain action is attributable to the person who took it. The operator key owns the
registry (clinician verification) and tops up users' gas.
"""

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from eth_abi import decode, encode
from eth_account.signers.local import LocalAccount
from eth_utils import keccak, to_checksum_address


def selector(signature: str) -> bytes:
    return keccak(text=signature)[:4]


# Function signatures the backend relies on (tests check them against contracts/abi).
SIGNATURES = {
    "getRecord": "getRecord(bytes32)",
    "canAccess": "canAccess(bytes32,address)",
    "verifyReport": "verifyReport(bytes32)",
    "cliniciansOf": "cliniciansOf(address)",
    "patientsOf": "patientsOf(address)",
    "isClinician": "isClinician(address)",
    "owner": "owner()",
    "setClinician": "setClinician(address,bool)",
    "publishRecord": "publishRecord(bytes32,address,bytes32,string,string)",
    "grantAccess": "grantAccess(address)",
    "revokeAccess": "revokeAccess(address)",
}
ERRORS = [
    "NotClinician",
    "InvalidAddress",
    "InvalidRecordId",
    "InvalidHash",
    "InvalidCid",
    "RecordAlreadyExists",
    "DuplicateReport",
    "RecordNotFound",
    "AccessDenied",
    "OwnableUnauthorizedAccount",
]
_ERROR_SIGNATURES = {
    name: f"{name}(address)" if name.startswith("Ownable") else f"{name}()" for name in ERRORS
}
_ERRORS_BY_SELECTOR = {selector(sig): name for name, sig in _ERROR_SIGNATURES.items()}
_RECORD_TUPLE = "(address,uint64,address,bytes32,string,string)"

MIN_GAS_BALANCE_WEI = 10**16  # 0.01 ETH
GAS_TOP_UP_WEI = 5 * 10**16  # 0.05 ETH
RECEIPT_TIMEOUT_SECONDS = 120.0


class ChainError(Exception):
    """The RPC node is unreachable or a transaction failed unexpectedly."""


class ContractRejected(Exception):
    """The contract reverted with one of its custom errors."""

    def __init__(self, error_name: str) -> None:
        super().__init__(error_name)
        self.error_name = error_name


@dataclass(frozen=True)
class OnChainRecord:
    patient: str
    published_at: int
    issuer: str
    report_hash: str
    scan_cid: str
    report_cid: str


@dataclass(frozen=True)
class VerifiedReport:
    record_id: str
    issuer: str
    published_at: int


@dataclass(frozen=True)
class ChainStatus:
    block_number: int
    owner: str
    operator: str
    operator_balance_wei: int


class Registry(Protocol):
    operator_address: str

    async def is_clinician(self, account: str) -> bool: ...
    async def can_access(self, record_id: str, account: str) -> bool: ...
    async def get_record(self, record_id: str, caller: str) -> OnChainRecord: ...
    async def verify_report(self, report_sha256: str) -> VerifiedReport | None: ...
    async def clinicians_of(self, patient: str) -> list[str]: ...
    async def patients_of(self, clinician: str) -> list[str]: ...
    async def set_clinician(self, clinician: str, active: bool) -> str: ...
    async def publish_record(
        self,
        signer: LocalAccount,
        record_id: str,
        patient: str,
        report_sha256: str,
        scan_cid: str,
        report_cid: str,
    ) -> str: ...
    async def grant_access(self, signer: LocalAccount, clinician: str) -> str: ...
    async def revoke_access(self, signer: LocalAccount, clinician: str) -> str: ...
    async def status(self) -> ChainStatus: ...


def _bytes32(hex_value: str) -> bytes:
    raw = bytes.fromhex(hex_value.removeprefix("0x"))
    if len(raw) != 32:
        raise ValueError("Expected a 32-byte value")
    return raw


class RegistryClient:
    def __init__(
        self,
        client: httpx.AsyncClient,
        rpc_url: str,
        address: str,
        chain_id: int,
        operator: LocalAccount,
    ) -> None:
        self._client = client
        self._rpc_url = rpc_url
        self._address = to_checksum_address(address)
        self._chain_id = chain_id
        self._operator = operator
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def operator_address(self) -> str:
        return self._operator.address

    # Reads

    async def is_clinician(self, account: str) -> bool:
        (active,) = await self._call("isClinician", ["address"], [account], ["bool"])
        return bool(active)

    async def can_access(self, record_id: str, account: str) -> bool:
        (allowed,) = await self._call(
            "canAccess", ["bytes32", "address"], [_bytes32(record_id), account], ["bool"]
        )
        return bool(allowed)

    async def get_record(self, record_id: str, caller: str) -> OnChainRecord:
        (record,) = await self._call(
            "getRecord", ["bytes32"], [_bytes32(record_id)], [_RECORD_TUPLE], sender=caller
        )
        patient, published_at, issuer, report_hash, scan_cid, report_cid = record
        return OnChainRecord(
            patient=to_checksum_address(patient),
            published_at=int(published_at),
            issuer=to_checksum_address(issuer),
            report_hash=report_hash.hex(),
            scan_cid=scan_cid,
            report_cid=report_cid,
        )

    async def verify_report(self, report_sha256: str) -> VerifiedReport | None:
        record_id, issuer, published_at = await self._call(
            "verifyReport", ["bytes32"], [_bytes32(report_sha256)], ["bytes32", "address", "uint64"]
        )
        if record_id == bytes(32):
            return None
        return VerifiedReport(
            "0x" + record_id.hex(), to_checksum_address(issuer), int(published_at)
        )

    async def clinicians_of(self, patient: str) -> list[str]:
        (accounts,) = await self._call("cliniciansOf", ["address"], [patient], ["address[]"])
        return [to_checksum_address(a) for a in accounts]

    async def patients_of(self, clinician: str) -> list[str]:
        (accounts,) = await self._call("patientsOf", ["address"], [clinician], ["address[]"])
        return [to_checksum_address(a) for a in accounts]

    async def status(self) -> ChainStatus:
        block = int(await self._rpc("eth_blockNumber", []), 16)
        (owner,) = await self._call("owner", [], [], ["address"])
        balance = await self._balance(self._operator.address)
        return ChainStatus(block, to_checksum_address(owner), self._operator.address, balance)

    # Writes

    async def set_clinician(self, clinician: str, active: bool) -> str:
        return await self._transact(
            self._operator, "setClinician", ["address", "bool"], [clinician, active]
        )

    async def publish_record(
        self,
        signer: LocalAccount,
        record_id: str,
        patient: str,
        report_sha256: str,
        scan_cid: str,
        report_cid: str,
    ) -> str:
        return await self._transact(
            signer,
            "publishRecord",
            ["bytes32", "address", "bytes32", "string", "string"],
            [_bytes32(record_id), patient, _bytes32(report_sha256), scan_cid, report_cid],
        )

    async def grant_access(self, signer: LocalAccount, clinician: str) -> str:
        return await self._transact(signer, "grantAccess", ["address"], [clinician])

    async def revoke_access(self, signer: LocalAccount, clinician: str) -> str:
        return await self._transact(signer, "revokeAccess", ["address"], [clinician])

    # Internals

    async def _call(
        self,
        function: str,
        types: list[str],
        args: list[object],
        returns: list[str],
        sender: str | None = None,
    ) -> tuple[object, ...]:
        data = selector(SIGNATURES[function]) + encode(types, args)
        tx: dict[str, str] = {"to": self._address, "data": "0x" + data.hex()}
        if sender:
            tx["from"] = sender
        result = await self._rpc("eth_call", [tx, "latest"])
        if not isinstance(result, str) or result in ("", "0x"):
            raise ChainError("Contract returned no data. Check CONTRACT_ADDRESS and CHAIN_RPC_URL.")
        return decode(returns, bytes.fromhex(result.removeprefix("0x")))

    async def _transact(
        self, signer: LocalAccount, function: str, types: list[str], args: list[object]
    ) -> str:
        data = "0x" + (selector(SIGNATURES[function]) + encode(types, args)).hex()
        if signer.address != self._operator.address:
            await self._ensure_gas(signer.address)
        async with self._locks[signer.address]:
            return await self._send(signer, to=self._address, data=data, value=0)

    async def _ensure_gas(self, account: str) -> None:
        if await self._balance(account) >= MIN_GAS_BALANCE_WEI:
            return
        async with self._locks[self._operator.address]:
            if await self._balance(account) < MIN_GAS_BALANCE_WEI:
                await self._send(self._operator, to=account, data="0x", value=GAS_TOP_UP_WEI)

    async def _send(self, signer: LocalAccount, *, to: str, data: str, value: int) -> str:
        call = {"from": signer.address, "to": to, "data": data, "value": hex(value)}
        gas = int(await self._rpc("eth_estimateGas", [call]), 16)
        nonce = int(await self._rpc("eth_getTransactionCount", [signer.address, "pending"]), 16)
        block = await self._rpc("eth_getBlockByNumber", ["latest", False])
        base_fee = int(block.get("baseFeePerGas", "0x0"), 16)
        try:
            tip = int(await self._rpc("eth_maxPriorityFeePerGas", []), 16)
        except ChainError:
            tip = 10**9
        signed = signer.sign_transaction(
            {
                "type": 2,
                "chainId": self._chain_id,
                "nonce": nonce,
                "to": to,
                "value": value,
                "data": data,
                "gas": gas * 12 // 10,
                "maxFeePerGas": base_fee * 2 + tip,
                "maxPriorityFeePerGas": tip,
            }
        )
        tx_hash = await self._rpc("eth_sendRawTransaction", ["0x" + signed.raw_transaction.hex()])
        receipt = await self._wait_for_receipt(tx_hash)
        if int(receipt["status"], 16) != 1:
            raise ChainError(f"Transaction {tx_hash} reverted")
        return tx_hash

    async def _wait_for_receipt(self, tx_hash: str) -> dict[str, str]:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + RECEIPT_TIMEOUT_SECONDS
        delay = 0.1
        while loop.time() < deadline:
            receipt = await self._rpc("eth_getTransactionReceipt", [tx_hash])
            if receipt:
                return receipt
            await asyncio.sleep(delay)
            delay = min(delay * 2, 2.0)
        raise ChainError(f"Timed out waiting for transaction {tx_hash}")

    async def _balance(self, account: str) -> int:
        return int(await self._rpc("eth_getBalance", [account, "latest"]), 16)

    async def _rpc(self, method: str, params: list[object]) -> Any:
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
        name = _ERRORS_BY_SELECTOR.get(bytes.fromhex(data[2:10]))
        if name is not None:
            return ContractRejected(name)
    return ChainError(f"Contract call failed: {error.get('message', 'unknown error')}")
