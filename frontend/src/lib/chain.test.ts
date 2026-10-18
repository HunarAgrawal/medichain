import { Interface, makeError } from "ethers";
import { describe, expect, it } from "vitest";

import { describeChainError, RECORDS_ABI } from "./chain";

const contract = new Interface(RECORDS_ABI);

describe("describeChainError", () => {
  it("explains a rejected wallet request", () => {
    const error = makeError("user rejected action", "ACTION_REJECTED", {
      action: "sendTransaction",
      reason: "rejected",
    });
    expect(describeChainError(error)).toBe("You rejected the request in your wallet.");
  });

  it("maps contract custom errors to plain sentences", () => {
    const error = makeError("execution reverted", "CALL_EXCEPTION", {
      action: "call",
      data: contract.encodeErrorResult("AccessDenied", []),
      reason: null,
      transaction: { to: null, data: "0x" },
      invocation: null,
      revert: { name: "AccessDenied", signature: "AccessDenied()", args: [] },
    });
    expect(describeChainError(error)).toBe("Your wallet does not have access to this record.");
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(describeChainError(new Error("boom"))).toBe(
      "The wallet request failed. Please try again.",
    );
  });

  it("covers every function the contract defines", () => {
    const names: string[] = [];
    contract.forEachFunction((fragment) => names.push(fragment.name));
    expect(names.sort()).toEqual([
      "createRecord",
      "getGrantees",
      "getRecord",
      "grantAccess",
      "hasAccess",
      "recordExists",
      "revokeAccess",
    ]);
  });
});
