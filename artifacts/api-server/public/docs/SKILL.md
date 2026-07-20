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
