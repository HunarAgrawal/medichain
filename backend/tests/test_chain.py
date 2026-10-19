"""The JSON-RPC registry client, against a scripted node."""

import json
from pathlib import Path

import httpx
import pytest
from eth_abi import encode
from eth_account import Account

from app.chain import (
    ERRORS,
    GAS_TOP_UP_WEI,
    SIGNATURES,
    ChainError,
    ContractRejected,
    RegistryClient,
    selector,
)
from app.config import HARDHAT_DEV_KEY
from tests.conftest import CONTRACT_ADDRESS

RPC = "http://chain.test"
OPERATOR = Account.from_key(HARDHAT_DEV_KEY)
USER = Account.create()
RECORD_ID = "0x" + "11" * 32
ABI_PATH = Path(__file__).resolve().parents[2] / "contracts" / "abi" / "MediChainRegistry.json"


class Node:
    """Scripted JSON-RPC node: records calls and answers from a handler table."""

    def __init__(self, **handlers) -> None:
        self.calls: list[dict] = []
        self.handlers = handlers

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.calls.append(body)
        handler = self.handlers.get(body["method"])
        if handler is None:
            raise AssertionError(f"unexpected RPC {body['method']}")
        result = handler(body["params"]) if callable(handler) else handler
        if isinstance(result, dict) and "error" in result:
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, **result})
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": result})

    def methods(self) -> list[str]:
        return [c["method"] for c in self.calls]


def _client(node: Node) -> RegistryClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(node))
    return RegistryClient(http, RPC, CONTRACT_ADDRESS, 31337, OPERATOR)


def _hex(types: list[str], values: list[object]) -> str:
    return "0x" + encode(types, values).hex()


def _revert(name: str) -> dict:
    return {
        "error": {
            "code": 3,
            "message": "execution reverted",
            "data": "0x" + selector(f"{name}()").hex(),
        }
    }


async def test_get_record_runs_from_the_caller_and_decodes_the_tuple() -> None:
    record = (USER.address, 1_700_000_000, OPERATOR.address, b"\x22" * 32, "bafyscan", "bafyreport")
    node = Node(eth_call=_hex(["(address,uint64,address,bytes32,string,string)"], [record]))

    result = await _client(node).get_record(RECORD_ID, caller=USER.address)

    tx = node.calls[0]["params"][0]
    assert tx["from"] == USER.address
    assert tx["data"].startswith("0x213681cd")
    assert result.patient == USER.address and result.issuer == OPERATOR.address
    assert result.report_hash == "22" * 32 and result.report_cid == "bafyreport"


async def test_verify_report_maps_the_zero_record_to_none() -> None:
    empty = _hex(["bytes32", "address", "uint64"], [bytes(32), "0x" + "00" * 20, 0])
    assert await _client(Node(eth_call=empty)).verify_report("ab" * 32) is None


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        ({"error": {"code": 3, "message": "x", "data": "0x4ca88867"}}, "AccessDenied"),
        (
            {"error": {"code": -32603, "message": "x", "data": {"data": "0x3e07f1a1"}}},
            "RecordNotFound",
        ),
    ],
)
async def test_reverts_become_named_contract_errors(error: dict, expected: str) -> None:
    with pytest.raises(ContractRejected) as raised:
        await _client(Node(eth_call=error)).get_record(RECORD_ID, caller=USER.address)
    assert raised.value.error_name == expected


async def test_unknown_reverts_and_dead_nodes_are_chain_errors() -> None:
    unknown = {"error": {"code": 3, "message": "reverted", "data": "0xdeadbeef"}}
    with pytest.raises(ChainError):
        await _client(Node(eth_call=unknown)).is_clinician(USER.address)
    with pytest.raises(ChainError, match="CONTRACT_ADDRESS"):
        await _client(Node(eth_call="0x")).is_clinician(USER.address)

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    client = RegistryClient(
        httpx.AsyncClient(transport=httpx.MockTransport(refuse)),
        RPC,
        CONTRACT_ADDRESS,
        31337,
        OPERATOR,
    )
    with pytest.raises(ChainError):
        await client.is_clinician(USER.address)


def _transacting_node(balance: int, sent: list[bytes], status: str = "0x1") -> Node:
    def send_raw(params: list[str]) -> str:
        sent.append(bytes.fromhex(params[0][2:]))
        return "0x" + f"{len(sent):064x}"

    return Node(
        eth_getBalance=hex(balance),
        eth_estimateGas="0x5208",
        eth_getTransactionCount="0x3",
        eth_getBlockByNumber={"baseFeePerGas": hex(10**9)},
        eth_maxPriorityFeePerGas=hex(10**9),
        eth_sendRawTransaction=send_raw,
        eth_getTransactionReceipt={"status": status},
    )


async def test_writes_are_signed_by_the_acting_user() -> None:
    sent: list[bytes] = []
    node = _transacting_node(balance=10**18, sent=sent)

    tx_hash = await _client(node).grant_access(USER, OPERATOR.address)

    assert tx_hash == "0x" + "1".zfill(64)
    assert len(sent) == 1
    assert Account.recover_transaction(sent[0]) == USER.address
    estimate = next(c for c in node.calls if c["method"] == "eth_estimateGas")["params"][0]
    assert estimate["data"].startswith("0x" + selector(SIGNATURES["grantAccess"]).hex())


async def test_low_balances_are_topped_up_by_the_operator_first() -> None:
    sent: list[bytes] = []
    await _client(_transacting_node(balance=0, sent=sent)).revoke_access(USER, OPERATOR.address)

    assert [Account.recover_transaction(raw) for raw in sent] == [OPERATOR.address, USER.address]


async def test_reverted_estimates_surface_the_contract_error() -> None:
    node = _transacting_node(balance=10**18, sent=[])
    node.handlers["eth_estimateGas"] = _revert("NotClinician")
    with pytest.raises(ContractRejected, match="NotClinician"):
        await _client(node).publish_record(
            USER, RECORD_ID, USER.address, "ab" * 32, "bafys", "bafyr"
        )


async def test_failed_receipts_raise() -> None:
    with pytest.raises(ChainError, match="reverted"):
        await _client(_transacting_node(10**18, [], status="0x0")).grant_access(
            USER, OPERATOR.address
        )


def test_gas_top_up_is_a_sensible_amount() -> None:
    assert 10**16 <= GAS_TOP_UP_WEI <= 10**17


@pytest.mark.skipif(not ABI_PATH.exists(), reason="contracts/abi not present")
def test_backend_signatures_match_the_compiled_contract() -> None:
    abi = json.loads(ABI_PATH.read_text())

    def signature(entry: dict) -> str:
        return f"{entry['name']}({','.join(_type(i) for i in entry['inputs'])})"

    def _type(param: dict) -> str:
        if param["type"].startswith("tuple"):
            inner = ",".join(_type(c) for c in param["components"])
            return f"({inner}){param['type'][5:]}"
        return param["type"]

    functions = {signature(e) for e in abi if e["type"] == "function"}
    errors = {e["name"] for e in abi if e["type"] == "error"}
    assert set(SIGNATURES.values()) <= functions
    assert set(ERRORS) <= errors
    get_record = next(e for e in abi if e.get("name") == "getRecord")
    assert _type(get_record["outputs"][0]) == "(address,uint64,address,bytes32,string,string)"
