import { Router, type IRouter } from "express";
import { getPublicClient, getActiveChain, getChainId, getExplorerUrl } from "../lib/chains.js";
import { getVirtualsConfig } from "../lib/virtuals.js";
import { cacheGet, cacheSet } from "../lib/cache.js";

const router: IRouter = Router();

router.get("/system/status", async (_req, res): Promise<void> => {
  const cacheKey = "system:status";
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) { res.json(cached); return; }

  const config = getVirtualsConfig();
  const network = (process.env.NEXT_PUBLIC_NETWORK ?? "mainnet") as "mainnet" | "testnet";

  let rpcHealthy = false;
  let blockNumber: number | null = null;

  try {
    const client = getPublicClient();
    blockNumber = Number(await client.getBlockNumber());
    rpcHealthy = true;
  } catch {
    rpcHealthy = false;
  }

  const status = {
    calibrated: config.calibrated,
    calibrationMessage: config.calibrationMessage,
    network,
    chainId: getChainId(),
    rpcHealthy,
    blockNumber,
    explorerUrl: getExplorerUrl(),
    virtualTokenAddress: config.virtualTokenAddress,
    factoryAddress: config.factoryAddress,
  };

  cacheSet(cacheKey, status, 15_000);
  res.json(status);
});

export default router;
