# OUTRIVE

**AI Agent Launchpad on Virtuals Protocol · Robinhood Chain**

OUTRIVE is a chat-first, non-custodial platform for launching AI agent tokens on [Virtuals Protocol](https://app.virtuals.io) via Robinhood Chain (chainId 4663). Users connect a wallet, describe their agent in plain language, and the OUTRIVE AI Engine constructs a fully-formed deployment transaction. The user's wallet signs it. No accounts. No forms. No code.

Live at [outrive.io](https://outrive.io)

---

## Repositories

| Repo | Description |
|---|---|
| [outrive/app](https://github.com/outrive/app) | Main monorepo - React frontend, API server, agent engine, shared libraries |
| [outrive/sdk](https://github.com/outrive/sdk) | TypeScript SDK for the OUTRIVE API |
| [outrive/contracts](https://github.com/outrive/contracts) | Contract ABIs and on-chain integration config for Robinhood Chain |

---

## How It Works

```
User describes agent  ->  AI Engine builds TX  ->  User wallet signs  ->  Token live on Virtuals Protocol
```

1. Connect any EIP-1193 wallet (MetaMask, Rabby, or similar) to Robinhood Chain (chainId 4663)
2. Describe your agent token in the chat - name, ticker, personality, use case
3. OUTRIVE AI Engine generates a work order with the full transaction parameters
4. Review and sign - one wallet signature deploys your token to Virtuals Protocol
5. Your wallet address is the creator of record on-chain, permanently

---

## Stack

- **Frontend**: React 19, Vite, wagmi v2, viem, TailwindCSS
- **API**: Node.js 24, Express 5, Server-Sent Events (SSE streaming)
- **AI Engine**: 7 on-chain tools, SSE token streaming
- **Database**: PostgreSQL + Drizzle ORM
- **Chain**: Robinhood Chain - mainnet chainId 4663, testnet chainId 46630
- **Protocol**: Virtuals Protocol Instant Launch

---

## Links

- Website: [outrive.io](https://outrive.io)
- Discord: [discord.gg/outriveio](https://discord.gg/outriveio)
- X (Twitter): [@outrive_](https://x.com/outrive_)
- Virtuals Protocol: [app.virtuals.io](https://app.virtuals.io)
- Robinhood Chain Explorer: [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com)

---

## License

MIT
