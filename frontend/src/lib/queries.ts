import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

/** Public configuration: analysis types, upload limit, chain, demo accounts. */
export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: Infinity });
}

export function explorerTxUrl(
  explorer: string | null | undefined,
  txHash: string,
): string | undefined {
  return explorer ? `${explorer}/tx/${txHash}` : undefined;
}

export function explorerAddressUrl(
  explorer: string | null | undefined,
  address: string,
): string | undefined {
  return explorer ? `${explorer}/address/${address}` : undefined;
}
