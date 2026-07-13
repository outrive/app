# AI Engine

OUTRIVE is powered by Claude, built by Anthropic.

The AI engine reads user input, calls on-chain tools, and constructs
the deployment transaction. The user wallet signs — nothing is sent
on-chain without explicit user approval.

- Provider: [Anthropic](https://anthropic.com)
- GitHub: [github.com/anthropics](https://github.com/anthropics)
- Model: Claude Sonnet (latest)
- Tools: 7 on-chain tools (balance check, factory read, tx builder, etc.)
- Streaming: Server-Sent Events (SSE)
