# Changelog

All notable changes to OUTRIVE are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2026-07-20]

### Added
- **Hermes AI Strategy** — autonomous strategy layer powered by Nous Research Hermes via OpenRouter
  - `GET /api/autonomous/market-intel` — single endpoint returning vault state + all 20 live RWA prices + P&L summary, authenticated via OTR API key
  - LLM tool-calling loop: reads market intel → reasons over conditions → calls `update_strategy()` if adjustment is warranted
  - Ships with `hermes_tools.py` (OUTRIVE API bindings) and `hermes_orchestrator.py` (main strategy loop)
  - Model: `openai/gpt-4o-mini` via OpenRouter; ~$0.0002 per cycle; PM2-compatible for scheduled runs
- **Static docs endpoint** — `GET /docs/*` now served from API server at `api.outrive.io/docs/`
- **SKILL.md** — full agent capability map at `api.outrive.io/docs/SKILL.md`
  - Documents all default skills, all integrations, full API reference, market-intel response shape
- **Hermes integration guide** — step-by-step setup at `api.outrive.io/docs/hermes-integration.md`
  - Covers: OpenRouter key setup, Python venv, hermes_tools.py, hermes_orchestrator.py, one-cycle test, PM2 daemon
- **DOCS page update** — Section 10 added to the in-app DOCS page with Hermes architecture diagram, 8-step guide, model comparison table, and download button for the full .md guide

### Changed
- `README.md` — full rewrite to reflect live feature set: autonomous vault, Hermes AI, RWA trading, CLI, API reference, and SKILL.md link
- `app.ts` — added `express.static` middleware to serve `public/` directory from API server

---

## [2026-07-19]

### Added
- **RWA portfolio sparklines** — in-memory ring buffer tracking price history per token; rendered as SVG mini-charts in the RWA dashboard
- **Realized P&L tracking** — average-cost accounting per position; shows entry price, current price, and realized gain/loss in USD
- **Portfolio mini widget** — top-of-page summary showing total invested, total P&L, and best/worst performing positions
- **Global limit order banner** — persistent UI element showing all active limit orders across all RWA tokens
- **Quick trade buttons** — one-click buy/sell at oracle price from the RWA dashboard without opening a full trade panel
- **RWA logo proxy** — `GET /api/rwa/logo/:address` proxies logos from cdn.robinhood.com (hotlink-protected) through the API server

### Fixed
- **RWA price race condition** — parallel `eth_call` batch causing RPC 429s and garbage prices; fixed with sequential 150ms-gap background refresh and a UI `pick()` helper that selects the most recent valid price

---

## [2026-07-18]

### Added
- **OTR API key system** — generate, list, and revoke long-lived OTR API keys (`OTR-{32 hex}`) from the Autonomous page; SHA-256 hashed server-side, full key shown once at creation
- **Autonomous vault agent** — VPS-hosted `index.mjs` that reads vault config and executes RWA trades on FlapPortal every 30 seconds
- **CLI authentication** — wallet-signed nonce flow for terminal access; `outrive-cli.mjs` downloadable at `/api/cli/outrive-cli.mjs`; matching `/cli-auth` web page
- **VPS setup guide** — OUT-AUT-05 and OUT-AUT-06 sheets in the Autonomous page with step-by-step instructions and copyable code snippets

### Changed
- Autonomous page now shows vault status, total trades, total P&L, and strategy config in real time
- Session auth extended to 1 hour per nonce cycle

---

## [2026-07-17]

### Added
- **Autonomous page** — full vault management UI with wallet auth, strategy config, and VPS agent setup guide
- **RWA trading** — buy/sell 20 tokenized real-world assets via FlapPortal at oracle price
  - Protocol.FLAP (enum=3) used for all RWA routes — V2 AMM routes revert (no pool)
  - Fee routing: ETH bonding curve, VIRTUAL bonding curve (ETH router), Uniswap V2/V3/V4
- **20 RWA token support** — AAPL, NVDA, TSLA, GOOGL, META, MSFT, AMZN, AMD, PLTR, ORCL, SPY, QQQ, MU, COIN, INTC, CRWV, BE, USAR, USO, SPCX
- **Sequential price refresh** — 150ms gap between RPC calls with dual Blockscout+Yahoo Finance cache; Windows UA required for Yahoo Finance

---

## [2026-07-15]

### Added
- **Creator fee claim** — `LaunchSuccessPanel` shows claimable fee amount and claim button post-launch
- **Two-signature launch path** — `BondingV5.launch()` with server signer co-signature for anti-MEV protection
- **`tokenSupplyParams_` encoding** — correct ABI encoding for the Virtuals Protocol Instant Launch calldata
- **Anti-sniper default** — configurable buy tax decay (99%→1%) with 0–98 minute window
- **SystemStatus schema** — real-time RPC health, signer status, and factory contract verification on boot

---

## [2026-07-13]

### Added
- **Distribution page** — token distribution visualizer and vesting schedule UI
- **Architecture page** — technical architecture overview with contract addresses, fee routing diagram, and protocol facts

---

## [2026-07-12]

### Added
- Initial monorepo setup — React frontend, Express API server, shared libraries
- Virtuals Protocol factory integration — `0x43e4c17b15365596caae8e7d00e42bc8e988c2d4`
- Anthropic Claude Sonnet 4 agent engine with 7 on-chain tools and SSE streaming
- Robinhood Chain mainnet support — chainId 4663, FlapPortal, WETH, USDG
- Token indexer — WebSocket subscriptions to `NewApplication` and `NewPersona` factory events
- PostgreSQL + Drizzle ORM schema for launches, conversations, vault, and API keys
- wagmi v2 + viem wallet connection with WalletConnect support
