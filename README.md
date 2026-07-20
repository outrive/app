# OUTRIVE

**AI Agent Launchpad · Autonomous RWA Vault · Hermes AI Strategy**
**Virtuals Protocol · Robinhood Chain (chainId 4663)**

OUTRIVE is a chat-first, non-custodial platform for launching AI agent tokens on Virtuals Protocol and autonomously trading real-world assets on Robinhood Chain. Users connect a wallet, describe their agent in plain language, and the OUTRIVE AI Engine constructs a fully-formed deployment transaction. The user's wallet signs it. No accounts. No forms. No code.

Live at [outrive.io](https://outrive.io) · API at [api.outrive.io](https://api.outrive.io)

---

## What's Live

| Feature | Status |
|---------|--------|
| Chat-first agent token deployment | ✅ Live |
| Autonomous RWA trading vault | ✅ Live |
| Hermes AI strategy integration | ✅ Live |
| 20 RWA tokens — live oracle prices | ✅ Live |
| OTR API key authentication | ✅ Live |
| CLI wallet-signed access | ✅ Live |
| Developer docs + SKILL.md | ✅ Live |
| Portfolio P&L + sparklines | ✅ Live |

---

## How It Works

### Agent Token Deployment
```
User describes agent → AI Engine builds TX → User wallet signs → Token live on Virtuals Protocol
```

1. Connect any EIP-1193 wallet (MetaMask, Rabby) to Robinhood Chain (chainId 4663)
2. Describe your agent token — name, ticker, personality, use case
3. OUTRIVE AI generates a work order with full transaction parameters
4. Review and sign — one wallet signature deploys to Virtuals Protocol
5. Your wallet address is the on-chain creator of record, permanently

### Autonomous RWA Vault
```
index.mjs (every 30s) → reads vault config → executes RWA trade on FlapPortal → reports back
Hermes AI (every 1h)  → reads market intel → LLM reasoning → updates vault strategy config
```

Configure token, strategy, budget, take-profit, and stop-loss from the Autonomous dashboard.
Generate an OTR API key and run the vault agent on your own VPS — non-custodial, always.

---

## Hermes AI Integration

OUTRIVE integrates with [Nous Research Hermes](https://nousresearch.com) as an autonomous strategy layer:

- Reads 20 live RWA prices + vault state via `GET /api/autonomous/market-intel`
- LLM reasons over market conditions and decides strategy adjustments
- Writes updated config to vault — trading agent picks it up on the next tick
- Model: `openai/gpt-4o-mini` via OpenRouter (tool-calling)
- Cost: ~$0.0002 per cycle

**Full integration guide:** [api.outrive.io/docs/hermes-integration.md](https://api.outrive.io/docs/hermes-integration.md)

---

## Agent Skills

Full capability map of the OUTRIVE agent — what it can do and what it integrates with:

**[api.outrive.io/docs/SKILL.md](https://api.outrive.io/docs/SKILL.md)**

---

## API Reference

All endpoints require `Authorization: Bearer <token>` (session token or OTR API key).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | SSE stream — deployment agent |
| `GET`  | `/api/autonomous/market-intel` | Live RWA prices + vault state + P&L |
| `GET`  | `/api/autonomous/vault` | Read vault config |
| `POST` | `/api/autonomous/vault` | Update vault strategy |
| `POST` | `/api/autonomous/api-keys` | Generate OTR API key |
| `GET`  | `/api/rwa/flap-prices` | All 20 live RWA oracle prices |
| `GET`  | `/api/virtuals/tokens` | Live Virtuals Protocol market |
| `GET`  | `/api/system/status` | RPC health + version |
| `GET`  | `/api/cli/outrive-cli.mjs` | Download CLI script |

---

## Supported RWA Tokens

AAPL · NVDA · TSLA · GOOGL · META · MSFT · AMZN · AMD · PLTR · ORCL · SPY · QQQ · MU · COIN · INTC · CRWV · BE · USAR · USO · SPCX

All priced via FlapPortal oracle on Robinhood Chain. No AMM slippage — oracle-price execution.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, wagmi v2, viem, TailwindCSS |
| API | Node.js 24, Express 5, SSE streaming |
| AI Engine | Anthropic Claude Sonnet 4 · 7 on-chain tools |
| Strategy AI | Nous Research Hermes · OpenRouter |
| Database | PostgreSQL + Drizzle ORM |
| Chain | Robinhood Chain · mainnet chainId 4663 |
| Protocol | Virtuals Protocol Instant Launch |
| RWA Router | FlapPortal — oracle-price mint/redeem |

---

## Repositories

| Repo | Description |
|------|-------------|
| [outrive/app](https://github.com/outrive/app) | Main monorepo — React frontend, API server, agent engine |
| [outrive/sdk](https://github.com/outrive/sdk) | TypeScript SDK for the OUTRIVE API |
| [outrive/contracts](https://github.com/outrive/contracts) | Contract ABIs and on-chain integration config |

---

## Links

- Website: [outrive.io](https://outrive.io)
- API: [api.outrive.io](https://api.outrive.io)
- Docs: [api.outrive.io/docs/SKILL.md](https://api.outrive.io/docs/SKILL.md)
- Hermes Guide: [api.outrive.io/docs/hermes-integration.md](https://api.outrive.io/docs/hermes-integration.md)
- X (Twitter): [@Outrive_io](https://x.com/Outrive_io)
- Virtuals Protocol: [app.virtuals.io](https://app.virtuals.io)
- Robinhood Chain Explorer: [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com)

---

## License

MIT
