/** Wallet and MediChainRecords contract access through the browser wallet (EIP-1193). */

import {
  BrowserProvider,
  Contract,
  isError,
  type ContractTransactionResponse,
  type Eip1193Provider,
  type JsonRpcSigner,
} from "ethers";

export interface WalletProvider extends Eip1193Provider {
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}

export const RECORDS_ABI = [
  "error AccessDenied()",
  "error InvalidCid()",
  "error InvalidGrantee()",
  "error InvalidPatientId()",
  "error NotRecordOwner()",
  "error RecordAlreadyExists()",
  "error RecordNotFound()",
  "event AccessGranted(bytes32 indexed recordKey, address indexed grantee)",
  "event AccessRevoked(bytes32 indexed recordKey, address indexed grantee)",
  "event RecordCreated(bytes32 indexed recordKey, address indexed owner, string scanCid, string reportCid)",
  "function createRecord(string patientId, string scanCid, string reportCid)",
  "function getGrantees(string patientId) view returns (address[])",
  "function getRecord(string patientId) view returns (address owner, uint64 createdAt, string scanCid, string reportCid)",
  "function grantAccess(string patientId, address grantee)",
  "function hasAccess(string patientId, address account) view returns (bool)",
  "function recordExists(string patientId) view returns (bool)",
  "function revokeAccess(string patientId, address grantee)",
];

export interface OnChainRecord {
  owner: string;
  createdAt: Date;
  scanCid: string;
  reportCid: string;
}

export class RecordsClient {
  private readonly contract: Contract;

  constructor(signer: JsonRpcSigner, address: string) {
    this.contract = new Contract(address, RECORDS_ABI, signer);
  }

  /** Read calls run from the signer's address, so the contract's access check applies. */
  async getRecord(patientId: string): Promise<OnChainRecord> {
    const [owner, createdAt, scanCid, reportCid] = (await this.contract
      .getFunction("getRecord")
      .staticCall(patientId)) as [string, bigint, string, string];
    return { owner, createdAt: new Date(Number(createdAt) * 1000), scanCid, reportCid };
  }

  async getGrantees(patientId: string): Promise<string[]> {
    const grantees = (await this.contract
      .getFunction("getGrantees")
      .staticCall(patientId)) as string[];
    return [...grantees];
  }

  createRecord(
    patientId: string,
    scanCid: string,
    reportCid: string,
    onSubmitted?: () => void,
  ): Promise<string> {
    return this.send("createRecord", [patientId, scanCid, reportCid], onSubmitted);
  }

  grantAccess(patientId: string, grantee: string): Promise<string> {
    return this.send("grantAccess", [patientId, grantee]);
  }

  revokeAccess(patientId: string, grantee: string): Promise<string> {
    return this.send("revokeAccess", [patientId, grantee]);
  }

  /**
   * Submit a transaction and wait for one confirmation. ``onSubmitted`` fires once the wallet
   * has signed and broadcast it. Returns the transaction hash.
   */
  private async send(method: string, args: unknown[], onSubmitted?: () => void): Promise<string> {
    const tx = (await this.contract.getFunction(method)(...args)) as ContractTransactionResponse;
    onSubmitted?.();
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }
}

export async function connectRecords(
  wallet: WalletProvider,
  contractAddress: string,
): Promise<RecordsClient> {
  // A fresh provider per use avoids ethers' "network changed" errors after a chain switch.
  const signer = await new BrowserProvider(wallet).getSigner();
  return new RecordsClient(signer, contractAddress);
}

const CHAINS: Record<number, { name: string; addParams?: object }> = {
  1: { name: "Ethereum" },
  11155111: { name: "Sepolia" },
  31337: {
    name: "Hardhat local",
    addParams: {
      chainId: "0x7a69",
      chainName: "Hardhat local",
      rpcUrls: ["http://127.0.0.1:8545"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  },
};

export function chainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

export async function switchChain(wallet: WalletProvider, chainId: number): Promise<void> {
  const hexId = `0x${chainId.toString(16)}`;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (error) {
    const addParams = CHAINS[chainId]?.addParams;
    if ((error as { code?: number }).code !== 4902 || !addParams) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [addParams] });
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  AccessDenied: "Your wallet does not have access to this record.",
  InvalidCid: "The storage reference for this record is invalid.",
  InvalidGrantee: "Enter a wallet address other than the zero address or the owner.",
  InvalidPatientId: "Patient IDs must be 1 to 64 characters.",
  NotRecordOwner: "Only the record owner can manage access.",
  RecordAlreadyExists: "A record with this patient ID already exists.",
  RecordNotFound: "No record exists for this patient ID.",
};

/** Turn wallet and contract errors into a sentence a person can act on. */
export function describeChainError(error: unknown): string {
  if (isError(error, "ACTION_REJECTED") || (error as { code?: number }).code === 4001) {
    return "You rejected the request in your wallet.";
  }
  if (isError(error, "CALL_EXCEPTION")) {
    const name = error.revert?.name;
    return (name && REVERT_MESSAGES[name]) ?? "The contract rejected this request.";
  }
  if (isError(error, "INSUFFICIENT_FUNDS")) {
    return "Your wallet does not have enough ETH to pay the network fee.";
  }
  if (isError(error, "NETWORK_ERROR") || isError(error, "SERVER_ERROR")) {
    return "The blockchain network is unreachable. Check your wallet's network.";
  }
  return "The wallet request failed. Please try again.";
}
