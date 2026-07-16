import { parseAbiItem, decodeEventLog, type Log } from "viem";
import { db } from "@workspace/db";
import { tokensTable } from "@workspace/db";
import { eq, and, like, ne } from "drizzle-orm";
import { getVirtualsConfig } from "./virtuals.js";
import { getPublicClient, getActiveChain } from "./chains.js";
import { fetchFactoryLogs, fetchFactoryTransactionSenders, fetchTransactionSender } from "./blockscout.js";
import { logger } from "./logger.js";

// Real event: NewApplication(uint256 id) — emitted by AgentFactory proxy
// 0x43e4c17b15365596caae8e7d00e42bc8e988c2d4 when a user submits a new agent application.
// NewPersona(uint256 virtualId, address token, ...) emitted on bonding-curve graduation.
const NEW_APPLICATION_ABI = parseAbiItem(
  "event NewApplication(uint256 id)"
);
const NEW_PERSONA_ABI = parseAbiItem(
  "event NewPersona(uint256 virtualId, address token, address dao, address tba, address veToken, address lp)"
);

let indexerStarted = false;
let unwatch: (() => void) | null = null;

async function processApplicationLog(
  applicationId: string,
  txHash: string,
  blockNumber: number,
  txFrom: string
): Promise<void> {
  try {
    const chain = getActiveChain();
    await db
      .insert(tokensTable)
      .values({
        address: `app-${applicationId}`,        // placeholder until token address known at graduation
        name: `Agent Application #${applicationId}`,
        symbol: "PENDING",
        ticker: "PENDING",
        creator: txFrom.toLowerCase(),
        createdBlock: blockNumber,
        network: chain.id === 4663 ? "mainnet" : "testnet",
        txHash,
        phase: "PROTOTYPE",
      })
      .onConflictDoNothing();
    logger.info({ applicationId, txFrom }, "Agent application indexed from NewApplication event");
  } catch (err) {
    logger.error({ err, applicationId }, "Failed to index agent application");
  }
}

async function processPersonaLog(
  virtualId: string,
  tokenAddress: string,
  txHash: string,
  blockNumber: number
): Promise<void> {
  try {
    const chain = getActiveChain();
    // Read token name/symbol from the ERC-20 contract
    let name = `Virtual #${virtualId}`;
    let ticker = "AGENT";
    try {
      const client = getPublicClient();
      const [rawName, rawSymbol] = await Promise.all([
        client.readContract({ address: tokenAddress as `0x${string}`, abi: [{ type:"function",name:"name",stateMutability:"view",inputs:[],outputs:[{type:"string"}] }] as const, functionName: "name" }),
        client.readContract({ address: tokenAddress as `0x${string}`, abi: [{ type:"function",name:"symbol",stateMutability:"view",inputs:[],outputs:[{type:"string"}] }] as const, functionName: "symbol" }),
      ]);
      name = rawName as string;
      ticker = rawSymbol as string;
    } catch { /* use defaults */ }

    // Inherit the real creator from the PROTOTYPE placeholder row (app-{virtualId})
    const protoRows = await db
      .select({ creator: tokensTable.creator })
      .from(tokensTable)
      .where(eq(tokensTable.address, `app-${virtualId}`))
      .limit(1);
    const creator = protoRows[0]?.creator || "0x0000000000000000000000000000000000000000";

    await db
      .insert(tokensTable)
      .values({
        address: tokenAddress.toLowerCase(),
        name,
        ticker,
        creator,
        createdBlock: blockNumber,
        network: chain.id === 4663 ? "mainnet" : "testnet",
        txHash,
        phase: "ACTIVE",
      })
      .onConflictDoUpdate({
        target: [tokensTable.address],
        set: { name, ticker, phase: "ACTIVE", creator },
      });
    logger.info({ virtualId, tokenAddress, name, ticker, creator }, "Agent graduated from NewPersona event");
  } catch (err) {
    logger.error({ err, tokenAddress }, "Failed to index graduated agent");
  }
}

async function pollBlockscoutBackfill(factoryAddress: string): Promise<void> {
  try {
    const logs = await fetchFactoryLogs(factoryAddress);
    for (const log of logs) {
      if (!log.topics[0]) continue;
      try {
        // Try NewApplication first (32 bytes data = 1 field)
        if (log.data && log.data !== "0x" && log.data.length === 66) {
          const decoded = decodeEventLog({
            abi: [NEW_APPLICATION_ABI],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          if (decoded.eventName === "NewApplication") {
            const args = decoded.args as { id: bigint };
            // Fetch real sender from Blockscout (one call per new log entry)
            const txFrom = await fetchTransactionSender(log.transaction_hash);
            await processApplicationLog(
              args.id.toString(), log.transaction_hash, log.block_number, txFrom
            );
          }
        }
        // Try NewPersona (192 bytes = 6 fields)
        if (log.data && log.data.length >= 386) {
          const decoded = decodeEventLog({
            abi: [NEW_PERSONA_ABI],
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            data: log.data as `0x${string}`,
          });
          if (decoded.eventName === "NewPersona") {
            const args = decoded.args as { virtualId: bigint; token: string };
            await processPersonaLog(
              args.virtualId.toString(), args.token, log.transaction_hash, log.block_number
            );
          }
        }
      } catch {
        // Skip malformed logs
      }
    }
  } catch (err) {
    logger.debug({ err }, "Blockscout backfill failed — will retry");
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   CREATOR BACKFILL
   Fixes existing app-* rows that have creator = "" by paging through the
   factory's transaction history on Blockscout and matching txHash → sender.
   Runs in background at startup, processes up to 20 pages (1000 TXs).
───────────────────────────────────────────────────────────────────────────── */
let creatorBackfillRunning = false;

async function backfillCreators(_factoryAddress: string): Promise<void> {
  if (creatorBackfillRunning) return;
  creatorBackfillRunning = true;
  try {
    // Fetch up to 2000 most recent empty-creator rows (sorted newest first so active users are fixed first)
    const emptyRows = await db
      .select({ address: tokensTable.address, txHash: tokensTable.txHash })
      .from(tokensTable)
      .where(
        and(
          like(tokensTable.address, "app-%"),
          eq(tokensTable.creator, "")
        )
      )
      .orderBy(tokensTable.createdBlock)  // ascending — process all, oldest first
      .limit(2000);

    if (emptyRows.length === 0) {
      logger.debug("Creator backfill: no empty-creator rows to fix");
      return;
    }

    const rowsWithHash = emptyRows.filter(r => r.txHash);
    logger.info({ total: emptyRows.length, withHash: rowsWithHash.length }, "Creator backfill: starting");

    const BATCH = 8;   // concurrent Blockscout calls per batch
    const DELAY = 150; // ms between batches to avoid rate-limit
    let updated = 0;

    for (let i = 0; i < rowsWithHash.length; i += BATCH) {
      const chunk = rowsWithHash.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (row) => {
          const creator = await fetchTransactionSender(row.txHash!);
          if (!creator) return;
          await db
            .update(tokensTable)
            .set({ creator })
            .where(
              and(
                eq(tokensTable.address, row.address),
                eq(tokensTable.creator, "")  // only overwrite if still empty
              )
            );
          updated++;
        })
      );
      if (i + BATCH < rowsWithHash.length) {
        await new Promise(r => setTimeout(r, DELAY));
      }
    }

    logger.info({ updated, total: rowsWithHash.length }, "Creator backfill: complete");
  } catch (err) {
    logger.warn({ err }, "Creator backfill failed");
  } finally {
    creatorBackfillRunning = false;
  }
}

export function startIndexer(): void {
  if (indexerStarted) return;
  indexerStarted = true;

  const config = getVirtualsConfig();
  if (!config.factoryAddress) {
    logger.info("Indexer not started: VIRTUALS_FACTORY_ADDRESS not configured");
    return;
  }

  const factoryAddress = config.factoryAddress;
  logger.info({ factoryAddress }, "Starting OUTRIVE indexer");

  void pollBlockscoutBackfill(factoryAddress);

  // Fix empty-creator rows in background — does not block startup
  setTimeout(() => void backfillCreators(factoryAddress), 5_000);

  try {
    const client = getPublicClient();
    // Watch NewApplication events (new agent submissions)
    const unwatchApp = client.watchContractEvent({
      address: factoryAddress,
      abi: [NEW_APPLICATION_ABI],
      eventName: "NewApplication",
      onLogs: (logs: Log[]) => {
        for (const log of logs) {
          const typed = log as typeof log & {
            args: { id: bigint };
            transactionHash: string;
            blockNumber: bigint;
          };
          if (typed.args) {
            // Fetch sender from chain — one getTransaction call per new event
            void (async () => {
              let txFrom = "";
              try {
                const tx = await client.getTransaction({ hash: typed.transactionHash as `0x${string}` });
                txFrom = tx.from.toLowerCase();
              } catch {
                // Fall back to Blockscout if viem fails
                txFrom = await fetchTransactionSender(typed.transactionHash);
              }
              void processApplicationLog(
                typed.args.id.toString(), typed.transactionHash,
                Number(typed.blockNumber), txFrom
              );
            })();
          }
        }
      },
      onError: (_err: Error) => {
        logger.warn("WS subscription error on NewApplication — falling back to polling");
        setInterval(() => void pollBlockscoutBackfill(factoryAddress), 30_000);
      },
    });
    // Watch NewPersona events (agent token graduations)
    const unwatchPersona = client.watchContractEvent({
      address: factoryAddress,
      abi: [NEW_PERSONA_ABI],
      eventName: "NewPersona",
      onLogs: (logs: Log[]) => {
        for (const log of logs) {
          const typed = log as typeof log & {
            args: { virtualId: bigint; token: string };
            transactionHash: string;
            blockNumber: bigint;
          };
          if (typed.args) {
            void processPersonaLog(
              typed.args.virtualId.toString(), typed.args.token,
              typed.transactionHash, Number(typed.blockNumber)
            );
          }
        }
      },
      onError: () => { /* polling already set above */ },
    });
    unwatch = () => { unwatchApp(); unwatchPersona(); };
    logger.info("Indexer: WS subscriptions active (NewApplication + NewPersona)");
  } catch {
    logger.info("Indexer: WS unavailable, using 30s polling");
    setInterval(() => void pollBlockscoutBackfill(factoryAddress), 30_000);
  }
}

export function stopIndexer(): void {
  if (unwatch) { unwatch(); unwatch = null; }
  indexerStarted = false;
}
