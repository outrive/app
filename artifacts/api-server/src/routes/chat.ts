import { Router, type IRouter, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, launchesTable, tokensTable, chatCreditsTable, FREE_CHAT_LIMIT, OTR_PER_CREDIT } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getPublicClient } from "../lib/chains.js";
import { buildLaunchTx, signAndBroadcastLaunchTx, isCalibrated, getVirtualsConfig, validateTicker } from "../lib/virtuals.js";
import { getSignerAddress, hasBondingRole } from "../lib/signerWallet.js";
import { checkLaunchRateLimit } from "../lib/rateLimit.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { SYSTEM_PROMPT } from "../lib/agentPrompt.js";

const router: IRouter = Router();
const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey:  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ?? "",
});

const tools: Anthropic.Tool[] = [
  {
    name: "launch_agent_token",
    description: "Build an unsigned gas-only transaction for launching an AI-agent token through Virtuals Protocol Instant Launch on Robinhood Chain. Returns launchTx and preview for the Work Order card. Requires name AND ticker (≤6 chars). Dev buy is NOT supported — the factory function does not accept a buy amount; users can buy after launch via the market.",
    input_schema: {
      type: "object" as const,
      required: ["name", "ticker"],
      properties: {
        name:                { type: "string", description: "Agent token name, max 32 chars" },
        ticker:              { type: "string", description: "Token ticker, uppercase A-Z0-9, max 6 chars (rendered as $TICKER)" },
        description:         { type: "string", description: "Optional agent description, max 500 chars" },
        image_ref:           { type: "string", description: "Optional image URI" },
        anti_sniper_minutes: { type: "number", description: "Anti-sniper protection. Only two valid values: 1 (= 60s, default, buy tax 99% decaying to 1%) or 0 (disabled). No other durations are supported for Instant Launch." },
      },
    },
  },
  {
    name: "get_balances",
    description: "Get ETH gas balance and $VIRTUAL token balance for the connected wallet",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_market_overview",
    description: "Get a list of agent tokens from the production floor — newest or trending",
    input_schema: {
      type: "object" as const,
      properties: {
        tab: { type: "string", enum: ["newest", "trending"], default: "newest" },
      },
    },
  },
  {
    name: "get_token_info",
    description: "Get detailed info on a specific agent token by contract address",
    input_schema: {
      type: "object" as const,
      required: ["address"],
      properties: {
        address: { type: "string", description: "Token contract address" },
      },
    },
  },
  {
    name: "get_my_launches",
    description: "List all agent token launches for the current wallet",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_creator_fees",
    description: "Check claimable creator trading-fee share for the connected wallet",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "explain_launch_modes",
    description: "Return accurate copy explaining Virtuals' three launch modes: Instant Launch, Fund Raise, and 60 Days Experiment",
    input_schema: { type: "object" as const, properties: {} },
  },
];

type ToolInput = {
  name?: string;
  ticker?: string;
  description?: string;
  image_ref?: string;
  anti_sniper_minutes?: number;
  address?: string;
  tab?: "newest" | "trending";
};

async function executeTool(
  toolName: string,
  toolInput: ToolInput,
  walletAddress: string
): Promise<{ result: string; txPayload?: unknown; launchResult?: { txHash: `0x${string}`; preview: unknown } }> {
  switch (toolName) {
    case "launch_agent_token": {
      const { name, ticker, description = "", image_ref = "", anti_sniper_minutes } = toolInput;
      if (!name || !ticker) return { result: "ERROR: Both name and ticker are required." };

      // anti_sniper_minutes: undefined → default 1 min (60s); 0 → disabled; else convert
      const antiSniperDuration = anti_sniper_minutes === undefined
        ? 60
        : Math.min(Math.max(0, Math.round(anti_sniper_minutes * 60)), 60); // cap at 60s (1 min) — only valid value

      const rateCheck = checkLaunchRateLimit(walletAddress);
      if (!rateCheck.allowed) {
        return { result: "ERROR: Rate limit exceeded — max 5 launches per wallet per hour." };
      }

      if (!isCalibrated()) {
        const config = getVirtualsConfig();
        return { result: `ERROR: ${config.calibrationMessage ?? "Factory not calibrated."}` };
      }

      const tickerCheck = validateTicker(ticker.toUpperCase());
      if (!tickerCheck.ok) return { result: `ERROR: ${tickerCheck.error}` };

      // Server-side signing — OUTRIVE broadcasts with its BONDING_ROLE wallet
      const signerAddr = getSignerAddress();
      if (!signerAddr) {
        return { result: "ERROR: OUTRIVE server signer is not configured. Launches are temporarily unavailable." };
      }

      const launchResult = await signAndBroadcastLaunchTx({
        name,
        ticker: ticker.toUpperCase(),
        description,
        imageRef: image_ref,
        antiSniperDuration,
        walletAddress: walletAddress as `0x${string}`,
      });

      if ("error" in launchResult) return { result: `ERROR: ${launchResult.error}` };

      // Record launch in DB
      try {
        await db.insert(launchesTable).values({
          walletAddress: walletAddress.toLowerCase(),
          name,
          ticker: ticker.toUpperCase(),
          txHash: launchResult.txHash,
          status: "confirmed",
          network: "mainnet",
        });
      } catch {
        // Non-fatal — launch already succeeded on-chain
      }

      return {
        result: `LAUNCH CONFIRMED — Agent token "${name}" (${ticker.toUpperCase()}) deployed on-chain. Tx: ${launchResult.txHash}`,
        launchResult: { txHash: launchResult.txHash, preview: launchResult.preview },
      };
    }

    case "get_balances": {
      if (!walletAddress || walletAddress === "0x0000000000000000000000000000000000000000") {
        return { result: "No wallet connected." };
      }
      try {
        const client = getPublicClient();
        const ethBalance = await client.getBalance({ address: walletAddress as `0x${string}` });
        const ethStr = (Number(ethBalance) / 1e18).toFixed(6);

        const config = getVirtualsConfig();
        let virtualStr = "VIRTUAL_TOKEN_ADDRESS not configured";
        if (config.virtualTokenAddress) {
          try {
            const { parseAbi } = await import("viem");
            const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
            const virtualBalance = await client.readContract({
              address: config.virtualTokenAddress,
              abi,
              functionName: "balanceOf",
              args: [walletAddress as `0x${string}`],
            }) as bigint;
            virtualStr = (Number(virtualBalance) / 1e18).toFixed(4);
          } catch {
            virtualStr = "read failed";
          }
        }
        return { result: `ETH: ${ethStr} ETH (gas)\n$VIRTUAL: ${virtualStr}` };
      } catch {
        return { result: "Could not fetch balances — RPC may be unavailable." };
      }
    }

    case "get_market_overview": {
      const { tab = "newest" } = toolInput;
      const cacheKey = `market:${tab}`;
      const cached = cacheGet<unknown[]>(cacheKey);
      if (cached) return { result: JSON.stringify(cached.slice(0, 5)) };

      const tokens = await db
        .select()
        .from(tokensTable)
        .orderBy(tab === "trending" ? desc(tokensTable.volume24h) : desc(tokensTable.createdAt))
        .limit(10);

      cacheSet(cacheKey, tokens, 20_000);
      if (tokens.length === 0) return { result: "No agent tokens found on the production floor yet." };
      return {
        result: tokens
          .slice(0, 5)
          .map((t) => `$${t.ticker} (${t.name}) — ${t.phase} — price: ${t.lastPriceVirtual ?? "N/A"} $VIRTUAL, curve: ${t.curveProgress ?? 0}%`)
          .join("\n"),
      };
    }

    case "get_token_info": {
      const { address } = toolInput;
      if (!address) return { result: "ERROR: address required." };
      const [token] = await db.select().from(tokensTable).where(eq(tokensTable.address, address.toLowerCase()));
      if (!token) return { result: `No agent token found at address ${address}.` };
      return {
        result: `${token.name} ($${token.ticker}) — ${token.phase}\nCreator: ${token.creator}\nPrice: ${token.lastPriceVirtual ?? "N/A"} $VIRTUAL\nRaised: ${token.raisedVirtual ?? "0"} $VIRTUAL\nCurve: ${token.curveProgress ?? 0}% toward 42,000 $VIRTUAL graduation\nHolders: ${token.holders ?? 0}`,
      };
    }

    case "get_my_launches": {
      const launches = await db
        .select()
        .from(launchesTable)
        .where(eq(launchesTable.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(launchesTable.createdAt))
        .limit(10);

      if (launches.length === 0) return { result: "No agent token launches found for your wallet." };
      return {
        result: launches
          .map((l) => `$${l.ticker} (${l.name}) — ${l.status} — tx: ${l.txHash.slice(0, 10)}...`)
          .join("\n"),
      };
    }

    case "get_creator_fees":
      return { result: "Creator fee reads are unavailable until factory contract calibration — ABI stub in use. Check app.virtuals.io for your fee claims." };

    case "explain_launch_modes":
      return {
        result: `Virtuals Protocol offers three launch modes:\n\n` +
          `1. INSTANT LAUNCH — Quickest path. No base fee; you pay only network gas in ETH. Token trades on a bonding curve paired with $VIRTUAL immediately. This is the mode OUTRIVE automates.\n\n` +
          `2. FUND RAISE — Set a funding target in $VIRTUAL before the token launches publicly. Contributors can back the project before the curve opens. Configure at app.virtuals.io.\n\n` +
          `3. 60 DAYS EXPERIMENT — Extended incubation period for community building before the token goes live. Configure at app.virtuals.io.\n\nFor Fund Raise and 60 Days Experiment, go to https://app.virtuals.io and use the Launch Token page.`,
      };

    default:
      return { result: `Unknown tool: ${toolName}` };
  }
}

router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  const { messages, walletAddress = "", conversationId } = req.body as {
    messages: Array<{ role: string; content: string }>;
    walletAddress: string;
    conversationId?: number;
  };

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
    res.status(503).json({ error: "AI integration not configured — contact admin" });
    return;
  }

  /* ── Wallet required — no anonymous access ───────────────────── */
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const addrNorm  = walletAddress?.toLowerCase().trim() ?? "";
  if (!addrNorm || addrNorm === ZERO_ADDR || addrNorm.length < 10) {
    res.status(401).json({ error: "WALLET_REQUIRED", message: "Connect your wallet to use the OUTRIVE agent." });
    return;
  }

  /* ── Credit gate ─────────────────────────────────────────────── */
  if (addrNorm) {
    try {
      let [credits] = await db
        .select()
        .from(chatCreditsTable)
        .where(eq(chatCreditsTable.walletAddress, addrNorm));
      if (!credits) {
        [credits] = await db
          .insert(chatCreditsTable)
          .values({ walletAddress: addrNorm })
          .returning();
      }
      const freeRemaining = Math.max(0, FREE_CHAT_LIMIT - (credits.freeChatsUsed ?? 0));
      const otrCredits    = parseFloat(credits.otrCredits ?? "0");
      if (freeRemaining <= 0 && otrCredits < OTR_PER_CREDIT) {
        res.status(402).json({ error: "CREDITS_REQUIRED", freeRemaining: 0, otrCredits });
        return;
      }
    } catch (err) {
      req.log.error({ err }, "Credit gate check failed — allowing through");
      // fail-open: if DB is down don't block the user
    }
  }
  /* ─────────────────────────────────────────────────────────────── */

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  function sendEvent(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let continueLoop = true;
    const allTextParts: string[] = [];

    while (continueLoop) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: anthropicMessages,
      });

      for (const block of response.content) {
        if (block.type === "text") {
          allTextParts.push(block.text);
          sendEvent({ type: "text", content: block.text });
        }
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        anthropicMessages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          if (toolUse.type !== "tool_use") continue;

          const startTs = Date.now();
          sendEvent({ type: "tool_call", toolName: toolUse.name, status: "running" });

          const result = await executeTool(toolUse.name, toolUse.input as ToolInput, walletAddress);
          const duration = Date.now() - startTs;

          sendEvent({ type: "tool_call", toolName: toolUse.name, status: "done", duration });

          if (result.launchResult) {
            sendEvent({ type: "launch_result", ...result.launchResult });
          } else if (result.txPayload) {
            sendEvent({ type: "tx_payload", ...result.txPayload });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.result,
          });
        }

        anthropicMessages.push({ role: "user", content: toolResults });
      } else {
        continueLoop = false;
      }
    }

    const finalText = allTextParts.join("\n").trim();

    if (conversationId && walletAddress) {
      const userMsg = messages[messages.length - 1];
      if (userMsg) {
        await db.insert(messagesTable).values({ conversationId, role: "user", content: userMsg.content });
      }
      if (finalText) {
        await db.insert(messagesTable).values({ conversationId, role: "assistant", content: finalText });
        await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, conversationId));
      }
    }

    sendEvent({ type: "done" });

    /* ── Credit deduction ─────────────────────────────────────── */
    if (addrNorm && addrNorm !== ZERO_ADDR) {
      try {
        const [credits] = await db
          .select()
          .from(chatCreditsTable)
          .where(eq(chatCreditsTable.walletAddress, addrNorm));
        if (credits) {
          const freeRemaining = Math.max(0, FREE_CHAT_LIMIT - (credits.freeChatsUsed ?? 0));
          if (freeRemaining > 0) {
            await db
              .update(chatCreditsTable)
              .set({
                freeChatsUsed: (credits.freeChatsUsed ?? 0) + 1,
                totalChats:    (credits.totalChats ?? 0) + 1,
                updatedAt:     new Date(),
              })
              .where(eq(chatCreditsTable.walletAddress, addrNorm));
          } else {
            const newOtr = Math.max(0, parseFloat(credits.otrCredits ?? "0") - OTR_PER_CREDIT);
            await db
              .update(chatCreditsTable)
              .set({
                otrCredits: newOtr.toFixed(4),
                totalChats: (credits.totalChats ?? 0) + 1,
                updatedAt:  new Date(),
              })
              .where(eq(chatCreditsTable.walletAddress, addrNorm));
          }
        }
      } catch (err) {
        req.log.error({ err }, "Credit deduction failed");
      }
    }
    /* ─────────────────────────────────────────────────────────── */

    res.end();
  } catch (err) {
    req.log.error({ err }, "Chat error");
    sendEvent({ type: "error", message: err instanceof Error ? err.message : "Internal error" });
    res.end();
  }
});

export default router;
