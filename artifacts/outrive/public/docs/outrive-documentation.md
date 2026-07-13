# OUTRIVE Documentation

> Chat-first AI agent launchpad on Virtuals Protocol · Robinhood Chain (4663)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [How It Works](#2-how-it-works)
3. [Getting Started](#3-getting-started)
4. [The Chat Interface](#4-the-chat-interface)
5. [Token Configuration](#5-token-configuration)
6. [Launching Your Agent](#6-launching-your-agent)
7. [Creator Fees](#7-creator-fees)
8. [Credit System](#8-credit-system)
9. [Architecture](#9-architecture)
10. [FAQ](#10-faq)

---

## 1. Introduction

OUTRIVE is a deployment interface for AI agent tokens built on top of **Virtuals Protocol**. Instead of filling out forms or navigating multi-step dashboards, you describe your agent in plain language — OUTRIVE's deployment agent handles the rest.

The result is a fully configured token launch submitted directly to the Virtuals factory contract on Robinhood Chain, with your wallet as the creator of record on-chain.

### Core Principles

- **Chat-first** — plain language in, a ready-to-sign transaction out
- **Non-custodial** — OUTRIVE never holds your keys or signs on your behalf
- **Minimal friction** — one wallet signature per launch, no extra steps
- **Transparent** — every parameter is shown for review before you sign

---

## 2. How It Works

```
You → Chat → Deployment Agent → Token Config → Your Wallet Signs → On-Chain
```

1. You connect your wallet to Robinhood Chain (Chain ID 4663)
2. You describe your agent: name, ticker, role, personality, vision
3. The deployment agent asks follow-up questions and drafts the full token configuration in real time
4. A transaction payload is prepared and surfaced to your wallet
5. You review and sign — one signature
6. Your agent token is created via the Virtuals factory contract; the bonding curve fills automatically

OUTRIVE does not interact with your wallet until you explicitly approve the transaction in your wallet extension.

---

## 3. Getting Started

### Requirements

| Item | Detail |
|---|---|
| Wallet | MetaMask or any EIP-1193 compatible wallet |
| Network | Robinhood Chain · Chain ID **4663** |
| Balance | Enough ETH for gas on one contract call |
| Credits | 10 free chats included · no sign-up required |

### Connecting Your Wallet

1. Open [outrive.io](https://outrive.io)
2. Click **CONNECT** in the top-right corner
3. Select your wallet and approve the network switch to Robinhood Chain when prompted
4. Your address and network status appear in the header — you are ready

> **No account, email, or sign-up required.** Your wallet is your identity.

### Adding Robinhood Chain Manually

If your wallet does not auto-detect the network, add it manually:

| Field | Value |
|---|---|
| Network Name | Robinhood Chain |
| Chain ID | 4663 |
| Currency Symbol | ETH |
| RPC URL | https://rpc.robinhood.com |
| Explorer | https://explorer.robinhood.com |

---

## 4. The Chat Interface

OUTRIVE offers two input modes, toggled in the chat panel header.

### PROMPT Mode

Free-form natural language. Describe your agent the way you would explain it to a colleague. The deployment agent will ask clarifying questions and iterate with you until the configuration is complete.

**Example input**

```
I want to launch an AI agent called NEXUS that acts as an on-chain
research analyst. Ticker: NXS. Focused on DeFi data and protocol analysis.
It should have a calm, authoritative personality.
```

The deployment agent will respond with follow-up questions if needed (e.g. image URL, additional core types), then surface a full Work Order for your review.

### CLI Mode (`$_`)

Structured command syntax for users who prefer explicit parameters.

```bash
launch --name "NEXUS" --ticker "NXS" --desc "On-chain DeFi research analyst"
```

Run `help` in CLI mode to see the full command reference and all available flags.

### Session Progress

The three-step progress bar at the top of the page tracks your session:

```
● 01 CONNECT  →  ○ 02 INSTRUCT  →  ○ 03 SIGN & LAUNCH
```

Each step activates as you progress through the flow.

---

## 5. Token Configuration

The deployment agent collects and validates the following parameters before constructing the transaction.

| Parameter | Description | Constraints |
|---|---|---|
| `name` | Full agent name | 1–50 characters |
| `ticker` | Token symbol (without `$` prefix) | 1–8 characters, alphanumeric |
| `description` | Agent role and purpose | 1–500 characters |
| `imgUrl` | Token image URL | Valid HTTPS URL pointing to an image |
| `cores` | Core model types (e.g. Vision, Voice, Reasoning) | Array, minimum 1 value |
| `personality` | Agent persona traits | Freeform string |
| `system` | Agent system prompt / instructions | Freeform string |
| `role` | Functional role label | Freeform string |

### The Work Order Panel

Before any transaction is built, OUTRIVE renders a **Work Order** — a structured summary of all parameters the agent has collected. You can:

- Review every field before signing
- Request changes by continuing the conversation
- Cancel at any point without cost

The transaction is only constructed after you explicitly confirm the Work Order.

---

## 6. Launching Your Agent

### Transaction Flow

Once configuration is confirmed, OUTRIVE builds a call to the Virtuals Protocol factory:

```
VirtualsAgentFactory.createNewAgentTokenAndApplication(
  tokenSupplyParams_,
  tokenURIData_,
  daoVotingPowerData_,
  ...coreParams
)
```

This is a **single transaction** — one wallet signature covers the full launch. There is no separate token approval step.

### What Happens On-Chain

1. A new ERC-20 agent token is deployed
2. The token is registered in the Virtuals Protocol factory
3. A bonding curve is initialized — it begins filling automatically as buyers enter
4. Your wallet address is recorded as the creator of record
5. An application ID is assigned to your agent

### Anti-Sniper Protection

The factory applies anti-sniper logic at launch by default. This is handled automatically by the Virtuals Protocol — no configuration is required on your end.

### After Launch

Once the transaction is confirmed, OUTRIVE displays a **Launch Success** panel containing:

- Token name and ticker
- Application ID
- Transaction hash with a link to the block explorer
- Direct link to your agent's page on Virtuals Protocol

---

## 7. Creator Fees

Trade fees generated by your agent token flow through the Virtuals Protocol **AgentTaxV2** contract. OUTRIVE surfaces your accumulated fee balance in the Dashboard once your agent is live.

### How Fees Work

- Fees accrue per trade on the bonding curve
- The fee recipient (`projectTaxRecipient`) is set at launch to your connected wallet address
- No manual configuration is required — the factory sets this automatically

### Viewing Your Balance

Navigate to **DASHBOARD** in the sidebar. OUTRIVE reads your fee balance from AgentTaxV2 and displays it per agent.

### Claiming Fees

Claims are executed on-chain via the AgentTaxV2 contract directly. The Dashboard provides a claim interface once your balance exceeds zero.

> Fee rates, graduation thresholds, and claim mechanics are governed by Virtuals Protocol. OUTRIVE reads and surfaces this data — it does not control it.

---

## 8. Credit System

### Free Tier

Every wallet receives **10 free chat messages** with the deployment agent on first use. No wallet connection is required to start — free chats are available immediately on page load.

Credits are consumed per message sent. Reading responses, browsing the Market, or viewing the Dashboard does not consume credits.

### $OTR Credits

$OTR is the OUTRIVE utility token. Credits beyond the free tier are powered by $OTR.

| Tier | Credits | Status |
|---|---|---|
| STARTER | 10 $OTR | Coming Soon |
| BUILDER | 50 $OTR | Coming Soon |
| OPERATOR | 200 $OTR | Coming Soon |

> Credit purchases are locked until the $OTR token generation event (TGE). The **OUTRIVE** tab in the sidebar shows your real-time credit balance and usage once your wallet is connected.

### Checking Your Balance

1. Connect your wallet
2. Click **OUTRIVE** in the left sidebar
3. View your total credits, free tier usage, and $OTR token balance

---

## 9. Architecture

```
┌──────────────────────────────────────┐
│              outrive.io              │
│   React · Vite · Robinhood Chain     │
│  Chat UI · Market · Dashboard · Docs │
└─────────────────┬────────────────────┘
                  │ HTTPS / Server-Sent Events
┌─────────────────▼────────────────────┐
│             API Server               │
│   Node.js · OUTRIVE AI Engine        │
│  Chat · Credits · Market · Status    │
└──────────────┬───────────────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
┌────▼────────┐   ┌───────▼──────────────┐
│  Virtuals   │   │   AgentTaxV2 Contract │
│  Protocol   │   │  (creator fee reads)  │
│  Factory    │   └──────────────────────┘
└─────────────┘
Robinhood Chain · Chain ID 4663
```

### Component Overview

| Component | Role |
|---|---|
| **Chat UI** | PROMPT / CLI input, SSE streaming renderer, Work Order panel, tx signing flow |
| **API Server** | AI tool-use orchestration, transaction builder (`buildLaunchTx`), credit accounting, market data proxy |
| **Market Page** | Live token index sourced from Virtuals Protocol, price feed, volume data |
| **Dashboard** | Per-wallet agent list, creator fee balance reader via AgentTaxV2 |
| **OUTRIVE Page** | Credit balance, $OTR purchase panel, token info sheet |

### Streaming Chat

Chat responses are delivered via **Server-Sent Events (SSE)**. The API server streams the AI output token-by-token into the chat panel. Tool calls (like `build_launch_tx`) are resolved server-side and result in structured payloads rendered in the UI - not raw JSON surfaced to the user.

---

## 10. FAQ

**Do I need to create an account?**

No. Your wallet is your identity. No email address, username, or sign-up flow is required at any point.

---

**Which wallets are supported?**

Any EIP-1193 compatible wallet — MetaMask, Rabby, Frame, or similar. The wallet must be on or switchable to Robinhood Chain (Chain ID 4663).

---

**How many wallet signatures does a launch require?**

One. OUTRIVE submits a single `createNewAgentTokenAndApplication` call. There is no token approval step.

---

**Can I use OUTRIVE without connecting a wallet?**

Yes, partially. You get 10 free chats without connecting. However, you cannot sign a launch transaction without a connected wallet — the factory call requires an on-chain signer.

---

**Can I edit my agent after launch?**

On-chain parameters (name, ticker, token supply) are immutable after the factory call. Agent metadata such as persona and system prompt may be updatable depending on Virtuals Protocol governance — refer to their documentation for current policy.

---

**What happens when my free chats run out?**

You will be prompted to acquire $OTR credits via the OUTRIVE tab. Credit top-ups will be available after the $OTR TGE. No chats are available beyond the free tier until then.

---

**Does OUTRIVE take a supply allocation or graduation bonus?**

No. OUTRIVE does not take any token supply, allocation, or graduation liquidity cut. All trade fees flow through the Virtuals Protocol AgentTaxV2 contract directly to your wallet as creator.

---

**Where do my creator fees accumulate?**

Fees accumulate in AgentTaxV2 under your wallet address as `projectTaxRecipient`. You claim them directly on-chain via the Dashboard claim interface.

---

**Is my token visible on Virtuals Protocol immediately after launch?**

Yes. Once the transaction is confirmed on Robinhood Chain, your agent is indexed by the Virtuals Protocol and appears on their platform alongside all other agents.

---

**What is the bonding curve graduation threshold?**

Graduation is determined by the Virtuals Protocol bonding curve mechanics. The curve fills automatically as buyers enter. Once the threshold is reached, the protocol graduates the token to a full AMM pool. OUTRIVE does not control or configure this threshold.

---

**Is the OUTRIVE source code open?**

Refer to the OUTRIVE GitHub for current open-source status and license information.

---

*OUTRIVE · [outrive.io](https://outrive.io) · Powered by Virtuals Protocol*
