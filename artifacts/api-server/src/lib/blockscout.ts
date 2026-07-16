import { getBlockscoutApiUrl } from "./chains.js";
import { logger } from "./logger.js";

export interface BlockscoutToken {
  address: string;
  name: string;
  symbol: string;
  total_supply?: string;
  holders?: string;
  type?: string;
}

export interface BlockscoutLog {
  topics: string[];
  data: string;
  transaction_hash: string;
  block_number: number;
  index: number;
}

export async function fetchTokenInfo(address: string): Promise<BlockscoutToken | null> {
  try {
    const apiUrl = getBlockscoutApiUrl();
    const res = await fetch(`${apiUrl}/tokens/${address}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json() as BlockscoutToken;
  } catch (err) {
    logger.debug({ err, address }, "Blockscout token fetch failed");
    return null;
  }
}

export async function fetchFactoryLogs(factoryAddress: string, page = 1): Promise<BlockscoutLog[]> {
  try {
    const apiUrl = getBlockscoutApiUrl();
    const res = await fetch(
      `${apiUrl}/addresses/${factoryAddress}/logs?page=${page}&limit=50`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as { items?: BlockscoutLog[] };
    return json.items ?? [];
  } catch (err) {
    logger.debug({ err, factoryAddress }, "Blockscout logs fetch failed");
    return [];
  }
}

export async function fetchAddressTransactions(address: string): Promise<unknown[]> {
  try {
    const apiUrl = getBlockscoutApiUrl();
    const res = await fetch(
      `${apiUrl}/addresses/${address}/transactions?limit=10`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const json = await res.json() as { items?: unknown[] };
    return json.items ?? [];
  } catch (err) {
    logger.debug({ err, address }, "Blockscout tx fetch failed");
    return [];
  }
}

export interface BlockscoutTxItem {
  hash: string;
  from: { hash: string };
}

/**
 * Fetch a page of transactions sent TO `address` (e.g. the factory contract).
 * Returns items with `hash` and `from.hash` (sender).
 * Uses Blockscout v2 cursor pagination: pass `nextPageParams` from the previous response.
 */
export async function fetchFactoryTransactionSenders(
  factoryAddress: string,
  nextPageParams?: Record<string, string>
): Promise<{ items: BlockscoutTxItem[]; nextPageParams: Record<string, string> | null }> {
  try {
    const apiUrl = getBlockscoutApiUrl();
    const params = new URLSearchParams({ limit: "50", filter: "to" });
    if (nextPageParams) {
      Object.entries(nextPageParams).forEach(([k, v]) => params.set(k, v));
    }
    const res = await fetch(
      `${apiUrl}/addresses/${factoryAddress}/transactions?${params}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return { items: [], nextPageParams: null };
    const json = await res.json() as { items?: BlockscoutTxItem[]; next_page_params?: Record<string, string> | null };
    return {
      items: (json.items ?? []).filter(i => i?.hash && i?.from?.hash),
      nextPageParams: json.next_page_params ?? null,
    };
  } catch (err) {
    logger.debug({ err, factoryAddress }, "Blockscout factory transactions fetch failed");
    return { items: [], nextPageParams: null };
  }
}

/**
 * Fetch a single transaction's sender address from Blockscout.
 */
export async function fetchTransactionSender(txHash: string): Promise<string> {
  try {
    const apiUrl = getBlockscoutApiUrl();
    const res = await fetch(`${apiUrl}/transactions/${txHash}`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return "";
    const json = await res.json() as { from?: { hash?: string } };
    return json?.from?.hash?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}
