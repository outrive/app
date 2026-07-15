# AI Agent Engine

OUTRIVE includes a built-in AI agent deployment assistant. It reads natural-language prompts, calls on-chain tools, and constructs the deployment transaction — the user wallet signs, nothing is submitted on-chain without explicit approval.

## How It Works

```
User Prompt (natural language)
        │
        ▼
AI Agent Engine
  ├─ Validates name, ticker, metadata
  ├─ Calls on-chain tools (balance, factory config, fee estimate)
  ├─ Slot-fills any missing parameters before building
  └─ Returns unsigned transaction calldata
        │
        ▼
User Wallet Signs (MetaMask / Rabby / EIP-1193)
        │
        ▼
Virtuals Protocol Factory (Robinhood Chain)
  └─ Deploys bonding curve agent token on-chain
```

## Available Tools

| Tool | Description |
|---|---|
| `get_balances` | Read native + token balances for a wallet |
| `get_factory_config` | Read current factory address and creation fee |
| `launch_agent_token` | Build unsigned transaction for token creation |
| `get_my_launches` | List tokens previously launched by a wallet |
| `get_market_tokens` | Fetch live OUTRIVE market data |
| `get_token_info` | Look up a specific token by address |
| `get_creator_fees` | Read accumulated trade fee balance |

## Transport

Responses stream over **Server-Sent Events (SSE)** for real-time token-by-token output.

## Self-Custody

OUTRIVE never holds keys or submits transactions. All on-chain actions require explicit wallet approval.
