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
