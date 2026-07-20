# OUTRIVE Agent — SKILL.md

> This document describes the default capabilities of the OUTRIVE autonomous agent, what it can do out of the box, and every external system it can integrate with.

---

## What OUTRIVE Agent Is

OUTRIVE is a fully autonomous, non-custodial AI agent operating on **Robinhood Chain (chainId 4663)** via **Virtuals Protocol**. It combines a natural-language deployment interface with a live autonomous trading vault, an AI strategy layer, and an open developer API — all accessible from a single platform at **outrive.io**.

The agent has two modes:
- **Deployment Agent** — chat-first interface to launch AI agent tokens on-chain
- **Autonomous Vault Agent** — executes live RWA trades on a schedule with AI strategy oversight

---

## Default Skills (No Setup Required)

### 1. Agent Token Deployment
Describe an AI agent in plain language → the agent builds and returns an unsigned launch transaction → user signs once → token is live on Virtuals Protocol bonding curve.

- Supports: name, ticker (≤6 chars), description, profile picture, optional initial buy
- Anti-sniper protection configurable (buy tax 99%→1% over 0–98 min window)
- Paid modules: Launch Radar (100 $VIRTUAL), Capital Formation (10 $VIRTUAL)
- Gas-only launch — no platform fee
- Token immutable after launch (name, ticker locked on-chain)

### 2. Live RWA Market Dashboard
Tracks 20 tokenized real-world assets on Robinhood Chain in real time.

- Live oracle prices via FlapPortal
- Sparkline price history (in-memory ring buffer)
- Portfolio positions, avg cost, realized P&L per token
- Quick trade buttons (buy/sell at oracle price)
- Global limit order banner

**Supported tokens:** AAPL · NVDA · TSLA · GOOGL · META · MSFT · AMZN · AMD · PLTR · ORCL · SPY · QQQ · MU · COIN · INTC · CRWV · BE · USAR · USO · SPCX

### 3. Autonomous Trading Vault
A VPS-based trading agent (`index.mjs`) that executes RWA trades every 30 seconds.

- Reads strategy config from `/api/autonomous/vault`
- Executes buys/sells on FlapPortal (Protocol.FLAP)
- Reports results back to vault
- Supports strategies: `dca` · `momentum` · `dip-buy` · `breakout` · `custom`
- Entry types: `market` · `limit` · `dip` · `breakout`
- Configurable: budget per trade, take-profit %, stop-loss %, max concurrent positions

### 4. OTR API Key Authentication
External agents and bots authenticate using OTR API keys without a browser.

- Format: `OTR-{32 hex chars}`
- Generated from the Autonomous page (wallet-signed)
- Used as `Authorization: Bearer OTR-xxxxx` on all API calls
- Keys are hashed server-side — full key shown only once at creation

### 5. CLI Access
Wallet-authenticated CLI for terminal-based access to OUTRIVE.

- Download: `curl https://api.outrive.io/api/cli/outrive-cli.mjs -o outrive-cli.mjs`
- Auth: signs a nonce with your wallet private key, returns a session token
- No browser required — full API access from any terminal or script

---

## Integrations

### Hermes AI Strategy (Live)
**What it does:** Autonomous AI strategy layer that reasons over live market data and adjusts vault config.

**How it works:**
1. Calls `GET /api/autonomous/market-intel` every hour
2. Reads vault state + 20 live RWA prices + P&L
3. LLM reasons over market conditions
4. Calls `POST /api/autonomous/vault` with updated strategy if needed
5. `index.mjs` picks up the new config on the next tick

**Model:** `openai/gpt-4o-mini` via OpenRouter (tool-calling required)
**Cost:** ~$0.0002 per cycle
**Full guide:** https://api.outrive.io/docs/hermes-integration.md

---

### Virtuals Protocol (Native)
**What it does:** On-chain AI agent token factory on Robinhood Chain.

- Instant Launch: deploy agent tokens with one wallet signature
- Bonding curve → Uniswap LP graduation at 42,000 $VIRTUAL
- LP tokens locked 10 years on graduation
- Creator of record = `msg.sender` (always the user's wallet)
- Factory contract: `0x43e4c17b15365596caae8e7d00e42bc8e988c2d4`

---

### FlapPortal — RWA Swap Router (Native)
**What it does:** Native mint/redeem gateway for all 20 RWA tokens on Robinhood Chain.

- Prices at on-chain oracle rate (no AMM slippage)
- Protocol.FLAP (enum=3) — used for all RWA buys and sells
- Contract: `0xC94135b63772b91D79d0A2DaAb2a8801f32359bD`
- No Uniswap V2/V3 pool — direct oracle-price execution

---

### Blockscout Explorer API v2 (Native)
**What it does:** On-chain data source for token metadata, transfers, holders, and factory events.

- Base URL: `https://robinhoodchain.blockscout.com/api/v2`
- Used for: token metadata, trade history, holder concentration, indexer backfill
- No API key required

---

### OpenRouter (Integration)
**What it does:** LLM gateway for Hermes AI strategy.

- Provides access to 100+ models via a single API
- Required for Hermes tool-calling loop
- Recommended model: `openai/gpt-4o-mini`
- Sign up: https://openrouter.ai
- Min credit: $1 (removes free-tier rate limits)

---

### Anthropic Claude (Native — Deployment Agent)
**What it does:** Powers the OUTRIVE deployment agent chat interface.

- Model: Claude Sonnet 4
- 7 tools: configure token, set anti-sniper, set initial buy, build launch tx, confirm launch, check balance, get network status
- SSE streaming via `POST /api/chat`
- Conversation history stored per session

---

### ElizaOS (Integration)
**What it does:** The most widely adopted open-source AI agent framework in crypto ("the Linux of crypto agents"). An ElizaOS plugin can call OUTRIVE's market-intel endpoint on a schedule, reason over prices with its LLM character, and push strategy updates to the vault automatically.

**Logic:**
```
ElizaOS character wakes on schedule
  → calls GET /api/autonomous/market-intel  (reads live prices + vault state)
  → LLM character reasons over conditions
  → calls POST /api/autonomous/vault        (writes updated strategy if needed)
  → index.mjs picks up config on next 30s tick → executes trade on-chain
```

**Setup:**

1. Install ElizaOS:
```bash
git clone https://github.com/elizaOS/eliza
cd eliza && pnpm install && pnpm build
```

2. Create the OUTRIVE plugin at `packages/plugin-outrive/src/index.ts`:
```typescript
import type { Plugin, Action } from "@elizaos/core";

const OTR_KEY = process.env.OUTRIVE_API_KEY;
const API     = "https://api.outrive.io";
const HDR     = { Authorization: `Bearer ${OTR_KEY}`, "Content-Type": "application/json" };

const getMarketIntel: Action = {
  name: "GET_MARKET_INTEL",
  description: "Read live RWA prices, vault status, and P&L from OUTRIVE",
  handler: async (_runtime, _message, _state, _options, callback) => {
    const res  = await fetch(`${API}/api/autonomous/market-intel`, { headers: HDR });
    const data = await res.json();
    await callback({ text: data.summary, data });
    return true;
  },
  similes: ["check market", "read vault", "get prices"],
  examples: [],
  validate: async () => !!OTR_KEY,
};

const updateStrategy: Action = {
  name: "UPDATE_STRATEGY",
  description: "Update OUTRIVE vault strategy config",
  handler: async (_runtime, message, _state, _options, callback) => {
    const config = JSON.parse(message.content.text);
    const res    = await fetch(`${API}/api/autonomous/vault`, {
      method: "POST", headers: HDR,
      body: JSON.stringify({ status: "running", strategyConfig: config }),
    });
    const data = await res.json();
    await callback({ text: "Strategy updated", data });
    return true;
  },
  similes: ["update strategy", "change config", "adjust vault"],
  examples: [],
  validate: async () => !!OTR_KEY,
};

export const outrivePlugin: Plugin = {
  name: "outrive",
  description: "OUTRIVE autonomous RWA vault integration",
  actions: [getMarketIntel, updateStrategy],
};
export default outrivePlugin;
```

3. Add to your character config (`characters/my-agent.json`):
```json
{
  "name": "MyAgent",
  "plugins": ["@elizaos/plugin-outrive"],
  "settings": {
    "OUTRIVE_API_KEY": "OTR-your-key-here"
  }
}
```

4. Run:
```bash
pnpm start --character=characters/my-agent.json
```

**Docs:** https://elizaos.github.io/eliza/

---

### GOAT — Great Onchain Agent Toolkit (Integration)
**What it does:** Open-source toolkit that connects LLMs to on-chain actions across EVM and Solana. OUTRIVE is registered as a GOAT "wallet tool" — any GOAT-compatible agent can read live RWA prices and update vault strategy the same way it calls swap or transfer tools.

**Setup:**

1. Install:
```bash
npm install @goat-sdk/core @goat-sdk/wallet-evm
```

2. Create OUTRIVE tool at `tools/outrive.ts`:
```typescript
import { Tool, ToolBase } from "@goat-sdk/core";

export class OutriveTool extends ToolBase {
  private headers = {
    Authorization: `Bearer ${process.env.OUTRIVE_API_KEY}`,
    "Content-Type": "application/json",
  };

  @Tool({ name: "get_market_intel", description: "Read live RWA prices and vault status from OUTRIVE" })
  async getMarketIntel() {
    const res = await fetch("https://api.outrive.io/api/autonomous/market-intel", { headers: this.headers });
    return res.json();
  }

  @Tool({ name: "update_vault_strategy", description: "Update OUTRIVE vault strategy config" })
  async updateStrategy(params: {
    token: string; strategy: string; budget_eth: string;
    tp_pct?: string; sl_pct?: string; entry_type?: string;
  }) {
    const res = await fetch("https://api.outrive.io/api/autonomous/vault", {
      method: "POST", headers: this.headers,
      body: JSON.stringify({ status: "running", strategyConfig: params }),
    });
    return res.json();
  }
}
```

3. Register in your GOAT agent:
```typescript
import { getOnChainTools } from "@goat-sdk/core";
import { OutriveTool } from "./tools/outrive";

const tools = await getOnChainTools({
  wallet: yourWallet,
  plugins: [new OutriveTool()],
});
```

**Docs:** https://ohmygoat.dev

---

### Claude via MCP — Model Context Protocol (Integration)
**What it does:** Anthropic's MCP is a standard protocol that lets Claude (Desktop, API, Cursor) call external tools defined as MCP servers. An OUTRIVE MCP server exposes `get_market_intel`, `update_strategy`, and `get_vault_status` — making the vault controllable from any MCP-compatible client in plain English, with zero custom orchestration code.

**Setup:**

1. Create MCP server at `outrive-mcp/index.mjs`:
```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = "https://api.outrive.io";
const HDR = { Authorization: `Bearer ${process.env.OUTRIVE_API_KEY}`, "Content-Type": "application/json" };

const server = new McpServer({ name: "outrive", version: "1.0.0" });

server.tool("get_market_intel", "Read live RWA prices, vault status, and P&L from OUTRIVE", {}, async () => {
  const res  = await fetch(`${API}/api/autonomous/market-intel`, { headers: HDR });
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("update_strategy", "Update OUTRIVE vault strategy config", {
  token:      z.string().describe("RWA ticker: AAPL, NVDA, TSLA, GOOGL, META, MSFT, AMZN, AMD, PLTR, ORCL, SPY, QQQ, MU, COIN, INTC, CRWV, BE, USAR, USO, SPCX"),
  strategy:   z.enum(["dca", "momentum", "dip-buy", "breakout", "custom"]),
  budget_eth: z.string().describe("ETH per trade, e.g. '0.002'"),
  tp_pct:     z.string().optional().describe("Take-profit %, e.g. '5'"),
  sl_pct:     z.string().optional().describe("Stop-loss %, e.g. '3'"),
  status:     z.enum(["running", "paused", "idle"]).optional(),
}, async (params) => {
  const res  = await fetch(`${API}/api/autonomous/vault`, {
    method: "POST", headers: HDR,
    body: JSON.stringify({ status: params.status ?? "running", strategyConfig: params }),
  });
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

server.tool("get_vault_status", "Read current vault configuration and status", {}, async () => {
  const res  = await fetch(`${API}/api/autonomous/vault`, { headers: HDR });
  const data = await res.json();
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

2. Install dependencies:
```bash
mkdir outrive-mcp && cd outrive-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
```

3. Add to Claude Desktop config (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "outrive": {
      "command": "node",
      "args": ["/path/to/outrive-mcp/index.mjs"],
      "env": {
        "OUTRIVE_API_KEY": "OTR-your-key-here"
      }
    }
  }
}
```

4. Restart Claude Desktop. You can now say in plain English:
> "Check my OUTRIVE vault and switch to momentum strategy if NVDA is up more than 3%."

Claude will call the tools, reason over the result, and execute the update — no code required on your end.

**Docs:** https://modelcontextprotocol.io

---

### BullSpot (Integration)
**What it does:** Autonomous AI trading agent platform that is MCP-compatible and supports Claude, Hermes, and Cursor as clients. BullSpot's signal engine can be connected to OUTRIVE's execution layer — BullSpot reads signals and generates strategy decisions, OUTRIVE's vault executes them on Robinhood Chain.

**Setup:**

1. Sign up at https://bullspot.app and install the BullSpot MCP server:
```bash
npm install -g @bullspot/mcp
```

2. Add both OUTRIVE and BullSpot to your MCP config (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "outrive": {
      "command": "node",
      "args": ["/path/to/outrive-mcp/index.mjs"],
      "env": { "OUTRIVE_API_KEY": "OTR-your-key-here" }
    },
    "bullspot": {
      "command": "bullspot-mcp",
      "env": { "BULLSPOT_API_KEY": "your-bullspot-key" }
    }
  }
}
```

3. In Claude Desktop or Cursor, the agent now has access to both systems simultaneously:
- BullSpot tools: `get_signal`, `get_portfolio`, `get_market_sentiment`
- OUTRIVE tools: `get_market_intel`, `update_strategy`, `get_vault_status`

4. Prompt example:
> "Check BullSpot signal for AAPL, then read my OUTRIVE vault. If BullSpot is bullish and my current strategy is dca, switch to momentum with 5% TP."

**Docs:** https://bullspot.app

---

### TradingAgents by TauricResearch (Integration)
**What it does:** The most starred autonomous financial trading framework in the world (93,000+ GitHub stars as of July 2026). Multi-agent architecture where specialized LLM agents — market analyst, risk manager, portfolio manager, and trader — debate and vote on strategy decisions. OUTRIVE replaces TradingAgents' default broker adapter as its on-chain execution target.

**Setup:**

1. Install TradingAgents:
```bash
git clone https://github.com/TauricResearch/TradingAgents
cd TradingAgents && pip install -r requirements.txt
```

2. Create OUTRIVE broker adapter at `tradingagents/brokers/outrive_broker.py`:
```python
import os, requests

API = "https://api.outrive.io"
HDR = {"Authorization": f"Bearer {os.environ['OUTRIVE_API_KEY']}", "Content-Type": "application/json"}

class OutriveBroker:
    """OUTRIVE vault adapter for TradingAgents framework."""

    def get_market_data(self, ticker: str) -> dict:
        """Returns live price and market context for a given RWA ticker."""
        r = requests.get(f"{API}/api/autonomous/market-intel", headers=HDR, timeout=10)
        data = r.json()
        return {
            "ticker":    ticker,
            "price":     data["market"].get(ticker, {}).get("priceUsd", 0),
            "vault":     data["vault"],
            "summary":   data["summary"],
            "allPrices": data["market"],
        }

    def execute_strategy(self, decision: dict) -> dict:
        """Writes TradingAgents strategy decision to OUTRIVE vault."""
        payload = {
            "status": decision.get("status", "running"),
            "strategyConfig": {
                "token":      decision["ticker"],
                "strategy":   decision["strategy"],   # dca | momentum | dip-buy | breakout
                "budget_eth": decision["budget_eth"],
                "tp_pct":     str(decision.get("tp_pct", 5)),
                "sl_pct":     str(decision.get("sl_pct", 3)),
                "entry_type": decision.get("entry_type", "market"),
            },
        }
        r = requests.post(f"{API}/api/autonomous/vault", headers=HDR, json=payload, timeout=10)
        return r.json()

    def get_portfolio(self) -> dict:
        """Returns current vault status and P&L."""
        r = requests.get(f"{API}/api/autonomous/vault", headers=HDR, timeout=10)
        return r.json()
```

3. Register in TradingAgents config (`config.yaml`):
```yaml
broker: outrive
broker_config:
  OUTRIVE_API_KEY: "OTR-your-key-here"
  target_ticker: "AAPL"
  cycle_interval_seconds: 3600
```

4. Run:
```bash
python main.py --broker outrive --ticker AAPL
```

**Docs:** https://github.com/TauricResearch/TradingAgents

---

### OpenAI Assistants API (Integration)
**What it does:** The same tool-calling pattern used with Hermes works identically with OpenAI Assistants. Define OUTRIVE tools as function definitions in an Assistant — OpenAI handles reasoning and dispatch. Compatible with GPT-4o, GPT-4o-mini, and o3-mini. Swap the OpenRouter client in `hermes_orchestrator.py` with the OpenAI Assistants client — zero other changes needed.

**Setup:**

1. Install:
```bash
pip install openai python-dotenv
```

2. Create assistant with OUTRIVE tools (`openai_strategy.py`):
```python
import os, json, time, requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

API = "https://api.outrive.io"
HDR = {"Authorization": f"Bearer {os.environ['OUTRIVE_API_KEY']}", "Content-Type": "application/json"}

TOOLS = [
    {"type": "function", "function": {
        "name": "get_market_intel",
        "description": "Read live RWA prices, vault status, and P&L from OUTRIVE.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "update_strategy",
        "description": "Update OUTRIVE vault strategy config.",
        "parameters": {
            "type": "object",
            "properties": {
                "token":      {"type": "string"},
                "strategy":   {"type": "string", "enum": ["dca", "momentum", "dip-buy", "breakout", "custom"]},
                "budget_eth": {"type": "string"},
                "tp_pct":     {"type": "string"},
                "sl_pct":     {"type": "string"},
                "entry_type": {"type": "string", "enum": ["market", "limit", "dip", "breakout"]},
                "status":     {"type": "string", "enum": ["running", "paused", "idle"]},
            },
            "required": ["token", "strategy", "budget_eth"],
        },
    }},
]

def dispatch(name, args):
    if name == "get_market_intel":
        return requests.get(f"{API}/api/autonomous/market-intel", headers=HDR).json()
    if name == "update_strategy":
        return requests.post(f"{API}/api/autonomous/vault", headers=HDR,
            json={"status": args.get("status", "running"), "strategyConfig": args}).json()

def run_cycle():
    # Create a one-shot thread
    thread = client.beta.threads.create()
    client.beta.threads.messages.create(thread_id=thread.id, role="user",
        content="Run a strategy analysis cycle. Read market intel first, then decide if strategy needs adjustment.")

    run = client.beta.threads.runs.create(
        thread_id=thread.id,
        assistant_id=os.environ["OPENAI_ASSISTANT_ID"],
        tools=TOOLS,
    )

    while run.status in ("queued", "in_progress", "requires_action"):
        time.sleep(1)
        run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        if run.status == "requires_action":
            outputs = []
            for tc in run.required_action.submit_tool_outputs.tool_calls:
                args   = json.loads(tc.function.arguments)
                result = dispatch(tc.function.name, args)
                outputs.append({"tool_call_id": tc.id, "output": json.dumps(result)})
            run = client.beta.threads.runs.submit_tool_outputs(
                thread_id=thread.id, run_id=run.id, tool_outputs=outputs)

    msgs = client.beta.threads.messages.list(thread_id=thread.id)
    print("[DECISION]", msgs.data[0].content[0].text.value)

if __name__ == "__main__":
    run_cycle()
```

3. Run:
```bash
OPENAI_API_KEY=sk-xxx OPENAI_ASSISTANT_ID=asst-xxx OUTRIVE_API_KEY=OTR-xxx python openai_strategy.py
```

**Docs:** https://platform.openai.com/docs/assistants

---

## Integration Compatibility Matrix

| Integration | Type | Effort | Cost/cycle | Status |
|-------------|------|--------|------------|--------|
| **Hermes (Nous Research)** | LLM strategy | ✅ Live | ~$0.0002 | Production |
| **ElizaOS** | Agent framework | Low — TS plugin | Model cost only | Ready |
| **GOAT** | Onchain toolkit | Low — register tool | Model cost only | Ready |
| **Claude via MCP** | LLM + protocol | Low — MCP server | Claude API cost | Ready |
| **BullSpot** | Trading platform | Low — MCP config | BullSpot + model | Ready |
| **TradingAgents** | Multi-agent finance | Medium — broker adapter | Model cost only | Ready |
| **OpenAI Assistants** | LLM strategy | Minimal — swap client | ~$0.001 GPT-4o | Ready |
| **Virtuals Protocol** | On-chain agents | Native | Gas only | Production |

---

## API Reference

All endpoints require `Authorization: Bearer <token>`.
Token is either a session token (wallet-signed) or an OTR API key.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/chat` | Session | SSE stream — deployment agent with tool loop |
| `GET`  | `/api/autonomous/market-intel` | OTR key | Live RWA prices + vault state + P&L summary |
| `GET`  | `/api/autonomous/vault` | OTR key | Read vault config and status |
| `POST` | `/api/autonomous/vault` | OTR key | Update vault strategy config |
| `GET`  | `/api/autonomous/api-keys` | Session | List active OTR keys |
| `POST` | `/api/autonomous/api-keys` | Session | Generate new OTR key |
| `DELETE` | `/api/autonomous/api-keys/:id` | Session | Revoke OTR key |
| `POST` | `/api/autonomous/auth/nonce` | None | Step 1 wallet auth — get nonce |
| `POST` | `/api/autonomous/auth/verify` | None | Step 2 wallet auth — verify signature |
| `GET`  | `/api/launches` | None | All OUTRIVE-deployed tokens |
| `GET`  | `/api/virtuals/tokens` | None | Live Virtuals Protocol market |
| `GET`  | `/api/rwa/flap-prices` | None | All 20 live RWA oracle prices |
| `GET`  | `/api/system/status` | None | RPC health + system version |
| `GET`  | `/api/cli/outrive-cli.mjs` | None | Download CLI script |

---

## market-intel Response (Hermes Input)

```json
{
  "timestamp": "2026-07-20T00:00:00.000Z",
  "vault": {
    "status": "running",
    "strategyConfig": {
      "token": "AAPL",
      "strategy": "dca",
      "budget_eth": "0.002",
      "tp_pct": "5",
      "sl_pct": "3",
      "entry_type": "market",
      "max_concurrent": "1"
    },
    "totalTrades": 12,
    "totalPnlUsd": 4.20
  },
  "market": {
    "AAPL": { "priceUsd": 334.92, "name": "Apple Inc.", "priceAgeMs": 4200 },
    "NVDA": { "priceUsd": 202.60, "name": "NVIDIA Corp.", "priceAgeMs": 4200 }
  },
  "targetToken": "AAPL",
  "targetPrice": 334.92,
  "tokenCount": 20,
  "summary": "Vault status: running. Strategy: dca on AAPL. Budget: 0.002 ETH/trade. TP: +5% / SL: -3%. Total trades: 12. Total P&L: $4.20."
}
```

---

## Infrastructure

| Component | Value |
|-----------|-------|
| Chain | Robinhood Chain · chainId 4663 |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |
| Protocol | Virtuals Protocol Instant Launch |
| LLM | Anthropic Claude Sonnet 4 |
| Strategy AI | OpenRouter → gpt-4o-mini |
| Frontend | outrive.io |
| API | api.outrive.io |

---

## Links

| Resource | URL |
|----------|-----|
| App | https://outrive.io |
| API | https://api.outrive.io |
| Hermes Integration Guide | https://api.outrive.io/docs/hermes-integration.md |
| Agent Skills (this file) | https://api.outrive.io/docs/SKILL.md |
| CLI Script | https://api.outrive.io/api/cli/outrive-cli.mjs |
| Explorer | https://robinhoodchain.blockscout.com |
| X / Twitter | https://x.com/Outrive_io |
