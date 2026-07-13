# Contributors

OUTRIVE is built by the OUTRIVE team and powered by the following technologies and partners.

---

## OUTRIVE Team

**[OUTRIVE](https://github.com/outrive)**
Core product, frontend, API server, agent engine, and infrastructure.

- Website: [outrive.io](https://outrive.io)
- Discord: [discord.gg/outriveio](https://discord.gg/outriveio)
- GitHub: [github.com/outrive](https://github.com/outrive)
- X (Twitter): [@outrive_](https://x.com/outrive_)

---

## AI Engine

**[Claude by Anthropic](https://github.com/anthropics)**
The OUTRIVE AI Engine is powered by Claude - the AI that reads your prompt, calls on-chain tools, and constructs the deployment transaction. No user data is stored by Anthropic.

- GitHub: [github.com/anthropics](https://github.com/anthropics)
- Website: [anthropic.com](https://anthropic.com)
- Model: Claude Sonnet (latest)

---

## Protocol Partner

**[Virtuals Protocol](https://github.com/Virtual-Protocol)**
OUTRIVE deploys AI agent tokens through Virtuals Protocol Instant Launch on Robinhood Chain (chainId 4663). Every token launched on OUTRIVE is a native Virtuals Protocol agent token - tradeable on the Virtuals marketplace from day one.

- GitHub: [github.com/Virtual-Protocol](https://github.com/Virtual-Protocol)
- Website: [app.virtuals.io](https://app.virtuals.io)
- Chain: Robinhood Chain - chainId 4663
- Docs: [whitepaper.virtuals.io](https://whitepaper.virtuals.io)

---

## How It Works Together

```
OUTRIVE Frontend (React/Vite)
        |
        v
OUTRIVE API Server (Node.js/Express)
        |
        v
Claude AI Engine (Anthropic)
  - Reads user prompt
  - Calls 7 on-chain tools
  - Builds unsigned transaction
        |
        v
User Wallet Signs (MetaMask / Rabby / EIP-1193)
        |
        v
Virtuals Protocol Factory (Robinhood Chain)
  - Deploys bonding curve agent token
  - User is creator of record on-chain
```

---

## Open Source

This repository is open source under the MIT License.
Pull requests, issues, and contributions are welcome.
