import json

import httpx
import pytest
from eth_abi import encode

from app.chain import AccessDeniedError, ChainError, RecordNotFoundError, RecordsContract
from tests.conftest import CONTRACT_ADDRESS

RPC_URL = "http://chain.test"
CALLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

# Selectors as compiled by Hardhat for MediChainRecords.
GET_RECORD = "0x11dd8845"
RECORD_EXISTS = "0x540248f0"
ACCESS_DENIED = "0x4ca88867"
RECORD_NOT_FOUND = "0x3e07f1a1"


def _contract(handler) -> RecordsContract:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return RecordsContract(client, RPC_URL, CONTRACT_ADDRESS)


def _reply(result: object = None, error: object = None) -> httpx.Response:
    body = {"jsonrpc": "2.0", "id": 1}
    body.update({"error": error} if error is not None else {"result": result})
    return httpx.Response(200, json=body)


async def test_get_record_calls_from_the_caller_and_decodes() -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        encoded = encode(
            ["address", "uint64", "string", "string"],
            [CONTRACT_ADDRESS, 1_700_000_000, "bafyscan", "bafyreport"],
        )
        return _reply("0x" + encoded.hex())

    record = await _contract(handler).get_record("P-001", caller=CALLER)

    tx = seen["params"][0]
    assert seen["method"] == "eth_call"
    assert tx["from"] == CALLER
    assert tx["data"].startswith(GET_RECORD)
    assert record.scan_cid == "bafyscan"
    assert record.report_cid == "bafyreport"
    assert record.created_at == 1_700_000_000


async def test_record_exists_uses_its_selector() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["params"][0]["data"].startswith(RECORD_EXISTS)
        return _reply("0x" + encode(["bool"], [True]).hex())

    assert await _contract(handler).record_exists("P-001") is True


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        ({"code": 3, "message": "reverted", "data": ACCESS_DENIED}, AccessDeniedError),
        ({"code": -32603, "message": "x", "data": {"data": RECORD_NOT_FOUND}}, RecordNotFoundError),
        ({"code": 3, "message": "reverted", "data": "0xdeadbeef"}, ChainError),
        ({"code": -32000, "message": "header not found"}, ChainError),
    ],
)
async def test_reverts_map_to_typed_errors(error: dict, expected: type[Exception]) -> None:
    contract = _contract(lambda _request: _reply(error=error))
    with pytest.raises(expected):
        await contract.get_record("P-001", caller=CALLER)


async def test_empty_result_means_wrong_address() -> None:
    with pytest.raises(ChainError, match="CONTRACT_ADDRESS"):
        await _contract(lambda _request: _reply("0x")).record_exists("P-001")


async def test_unreachable_node_raises_chain_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(ChainError):
        await _contract(handler).record_exists("P-001")
