# Hermes AI Strategy — Integration Guide

> Add an AI strategy layer to your OUTRIVE autonomous trading vault.
> Hermes reads live market data, reasons with an LLM, and updates your vault config automatically.
> Your existing trading agent (`index.mjs`) keeps running unchanged.

---

## How It Works

```
Hermes (every 1 hour)
  → GET /api/autonomous/market-intel   reads live RWA prices + vault state
  → LLM reasoning                      analyzes conditions, decides adjustments
  → POST /api/autonomous/vault         writes updated strategy config

index.mjs (every 30 seconds, unchanged)
  → GET /api/autonomous/vault          reads strategy config
  → executes trades on Robinhood Chain
```

Hermes and `index.mjs` run simultaneously on the same VPS. They never conflict — Hermes only writes config, `index.mjs` only executes trades.

---

## Prerequisites

- VPS already running `index.mjs` (see VPS Agent Setup on the Autonomous page)
- OTR API key generated from the Autonomous page
- OpenRouter account — sign up free at **https://openrouter.ai**
- Python 3.10 or higher (pre-installed on Ubuntu 22.04+)

---

## Step 1 — Get an OpenRouter API Key

1. Go to **https://openrouter.ai** and sign up
2. Navigate to **Keys → Create Key**
3. Copy the key (format: `sk-or-v1-xxxxxxxxxxxx`)
4. Add **$1 minimum credit** under **Credits** — required for tool-calling models. Cost per Hermes cycle is roughly $0.0002, so $1 lasts thousands of cycles.

---

## Step 2 — Test the Market Intel Endpoint

Before any setup, verify your OTR key can reach the API:

```bash
curl -s https://api.outrive.io/api/autonomous/market-intel \
  -H "Authorization: Bearer OTR-your-key-here" | python3 -m json.tool
```

Expected response:

```json
{
  "timestamp": "2026-07-19T06:00:00.000Z",
  "vault": {
    "status": "running",
    "strategyConfig": { "token": "AAPL", "strategy": "dca", "budget_eth": "0.002" },
    "totalTrades": 0,
    "totalPnlUsd": 0
  },
  "market": {
    "AAPL": { "priceUsd": 334.92, "name": "Apple Inc.", "priceAgeMs": 4200 },
    "NVDA": { "priceUsd": 202.60, "name": "NVIDIA Corp.", "priceAgeMs": 4200 }
  },
  "targetToken": "AAPL",
  "targetPrice": 334.92,
  "summary": "Vault status: running. Strategy: dca on AAPL..."
}
```

If `vault` is `null`, open the OUTRIVE Autonomous page, connect your wallet, authenticate, and save a configuration first.

---

## Step 3 — Install Python Dependencies

SSH into your VPS and run:

```bash
cd ~/outrive-agent

# Install python3-venv if not present
apt install python3-venv -y

# Create isolated virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install required packages
pip install requests openai python-dotenv

# Verify
python3 -c "import openai, requests; print('OK')"
```

You should see `OK`. The venv must be active (`(venv)` shown in your prompt) whenever you run Hermes scripts.

To reactivate after reconnecting via SSH:

```bash
source ~/outrive-agent/venv/bin/activate
```

---

## Step 4 — Add OpenRouter Key to .env

Open your existing `.env` file:

```bash
nano ~/outrive-agent/.env
```

Add this line below your existing entries:

```env
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
```

Your complete `.env` should look like this:

```env
AGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
OUTRIVE_API_KEY=OTR-your-key-here
WALLET_ADDRESS=0xYOUR_WALLET_ADDRESS
OUTRIVE_API_URL=https://api.outrive.io
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Step 5 — Create hermes_tools.py

```bash
nano ~/outrive-agent/hermes_tools.py
```

Paste the following:

```python
import os, requests
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/outrive-agent/.env"))

API   = os.environ.get("OUTRIVE_API_URL", "https://api.outrive.io")
TOKEN = os.environ.get("OUTRIVE_API_KEY")
HDR   = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def get_market_intel() -> dict:
    """Read live RWA prices, vault status, and P&L from OUTRIVE."""
    r = requests.get(f"{API}/api/autonomous/market-intel", headers=HDR, timeout=10)
    r.raise_for_status()
    return r.json()


def update_strategy(
    token: str,
    strategy: str,
    budget_eth: str,
    tp_pct: str = "5",
    sl_pct: str = "3",
    entry_type: str = "market",
    status: str = "running",
) -> dict:
    """
    Update the vault strategy configuration.

    token      : RWA ticker — AAPL | NVDA | TSLA | GOOGL | META | MSFT
                              AMZN | AMD | PLTR | ORCL | SPY | MU | SPCX
    strategy   : dca | momentum | dip-buy | breakout | custom
    budget_eth : ETH per trade, e.g. '0.002'
    tp_pct     : take-profit %, e.g. '5'
    sl_pct     : stop-loss %, e.g. '3'
    entry_type : market | limit | dip | breakout
    status     : running | paused | idle
    """
    r = requests.post(f"{API}/api/autonomous/vault", headers=HDR, timeout=10, json={
        "status": status,
        "strategyConfig": {
            "token":          token,
            "strategy":       strategy,
            "budget_eth":     budget_eth,
            "tp_pct":         tp_pct,
            "sl_pct":         sl_pct,
            "entry_type":     entry_type,
            "max_concurrent": "1",
        },
    })
    r.raise_for_status()
    return r.json()


def get_vault_status() -> dict:
    """Read current vault configuration and agent status."""
    r = requests.get(f"{API}/api/autonomous/vault", headers=HDR, timeout=10)
    r.raise_for_status()
    return r.json()
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

Test the tools file:

```bash
python3 -c "import hermes_tools; print(hermes_tools.get_market_intel()['summary'])"
```

You should see a one-line summary of your vault and current prices.

---

## Step 6 — Create hermes_orchestrator.py

```bash
nano ~/outrive-agent/hermes_orchestrator.py
```

Paste the following:

```python
import os, json, logging, time, argparse
from openai import OpenAI
from dotenv import load_dotenv
import hermes_tools

load_dotenv(os.path.expanduser("~/outrive-agent/.env"))
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%H:%M:%S",
)

client = OpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

# Model — gpt-4o-mini has reliable tool calling and low cost (~$0.0002/cycle)
MODEL = "openai/gpt-4o-mini"

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_market_intel",
            "description": "Read live RWA prices, vault status, P&L, and current strategy config from OUTRIVE.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_strategy",
            "description": "Update the OUTRIVE vault strategy configuration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "token":      {"type": "string", "description": "RWA ticker: AAPL, NVDA, TSLA, GOOGL, META, MSFT, AMZN, AMD, PLTR, ORCL, SPY, MU, SPCX"},
                    "strategy":   {"type": "string", "enum": ["dca", "momentum", "dip-buy", "breakout", "custom"]},
                    "budget_eth": {"type": "string", "description": "ETH per trade, e.g. '0.002'"},
                    "tp_pct":     {"type": "string", "description": "Take-profit percent, e.g. '5'"},
                    "sl_pct":     {"type": "string", "description": "Stop-loss percent, e.g. '3'"},
                    "entry_type": {"type": "string", "enum": ["market", "limit", "dip", "breakout"]},
                    "status":     {"type": "string", "enum": ["running", "paused", "idle"]},
                },
                "required": ["token", "strategy", "budget_eth"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vault_status",
            "description": "Read current vault configuration and agent status.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

SYSTEM = """You are an autonomous RWA (Real-World Asset) trading strategy advisor for OUTRIVE,
running on Robinhood Chain.

Each cycle you must:
1. Call get_market_intel() to read live prices and vault status
2. Analyze market conditions for the configured token
3. Decide if strategy parameters need adjustment
4. If yes, call update_strategy() with improved parameters
5. Explain your reasoning clearly — what you changed and why, or why you kept it the same

Hard rules:
- Never set budget_eth above 0.01 ETH without explicit user instruction
- Stop-loss (sl_pct) must always be between 2 and 10
- Use dca for sideways or unclear markets, momentum for strong uptrends
- If total P&L drops below -5% of initial budget, set status to paused and explain
- Make conservative incremental changes — never overhaul the entire strategy at once
- All tickers must be uppercase (AAPL not aapl)"""


def dispatch(name: str, args: dict):
    fn_map = {
        "get_market_intel": hermes_tools.get_market_intel,
        "update_strategy":  hermes_tools.update_strategy,
        "get_vault_status": hermes_tools.get_vault_status,
    }
    return fn_map[name](**args)


def run_cycle():
    logging.info("=== Hermes strategy cycle started ===")
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user",   "content": "Run a strategy analysis cycle now. Start by reading market intel."},
    ]

    for step in range(8):
        resp = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        msg = resp.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:
            logging.info("\n[HERMES DECISION]\n%s", msg.content)
            break

        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            logging.info("-> %s(%s)", tc.function.name, json.dumps(args))
            result = dispatch(tc.function.name, args)
            logging.info("<- %s", str(result)[:300])
            messages.append({
                "role":         "tool",
                "tool_call_id": tc.id,
                "content":      json.dumps(result),
            })

    logging.info("=== Cycle complete ===\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once",     action="store_true", help="Run one cycle then exit")
    parser.add_argument("--interval", type=int, default=3600, help="Seconds between cycles (default: 3600)")
    args = parser.parse_args()

    if args.once:
        run_cycle()
    else:
        logging.info("Hermes running every %d minutes", args.interval // 60)
        while True:
            run_cycle()
            logging.info("Next cycle in %d minutes", args.interval // 60)
            time.sleep(args.interval)
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Step 7 — Test One Cycle

```bash
cd ~/outrive-agent
source venv/bin/activate
python3 hermes_orchestrator.py --once
```

Expected output:

```
[13:37:00] === Hermes strategy cycle started ===
[13:37:01] -> get_market_intel({})
[13:37:01] <- {'timestamp': '...', 'vault': {...}, 'market': {...}}
[13:37:04] 
[HERMES DECISION]
Current AAPL price is $334.92. The DCA strategy with 0.002 ETH budget
and 5% stop-loss is appropriate for current sideways conditions.
No changes made this cycle.
[13:37:04] === Cycle complete ===
```

If you see `[HERMES DECISION]` with an analysis — the integration is working.

---

## Step 8 — Run Permanently with PM2

```bash
# Install PM2 if not already installed
npm install -g pm2

# Start Hermes (runs every hour)
pm2 start ~/outrive-agent/venv/bin/python3 \
  --name hermes-strategy \
  -- ~/outrive-agent/hermes_orchestrator.py

# Save so it restarts on server reboot
pm2 save
pm2 startup
# Follow the command that pm2 startup prints

# Check live logs
pm2 logs hermes-strategy

# Stop / restart
pm2 stop hermes-strategy
pm2 restart hermes-strategy
```

To run every 30 minutes instead of every hour:

```bash
pm2 start ~/outrive-agent/venv/bin/python3 \
  --name hermes-strategy \
  -- ~/outrive-agent/hermes_orchestrator.py --interval 1800
```

---

## Troubleshooting

### 401 Unauthorized from market-intel

```bash
# Check your OTR key is in .env
cat ~/outrive-agent/.env | grep OUTRIVE_API_KEY
# Should show: OUTRIVE_API_KEY=OTR-xxxxx
```

### openai.AuthenticationError

```bash
# Check your OpenRouter key is in .env
cat ~/outrive-agent/.env | grep OPENROUTER_API_KEY
# Should show: OPENROUTER_API_KEY=sk-or-v1-xxxxx
```

### vault is null in market-intel response

Go to the OUTRIVE Autonomous page → connect wallet → Authenticate → fill in strategy config → Save Configuration. Then test again.

### ModuleNotFoundError

```bash
source ~/outrive-agent/venv/bin/activate
pip install requests openai python-dotenv
```

### 429 Too Many Requests from OpenRouter

Add credit at **openrouter.ai → Credits**. The free tier has very low rate limits. $1 credit is enough for months of hourly cycles.

### PM2 logs show venv not found

```bash
# Use the full absolute path to the venv Python binary
pm2 start /root/outrive-agent/venv/bin/python3 \
  --name hermes-strategy \
  -- /root/outrive-agent/hermes_orchestrator.py
pm2 save
```

---

## File Structure

```
~/outrive-agent/
├── .env                      # private keys and API keys
├── index.mjs                 # trading agent (unchanged)
├── hermes_tools.py           # OUTRIVE API functions for Hermes
├── hermes_orchestrator.py    # Hermes AI strategy loop
└── venv/                     # Python virtual environment
```

---

## API Reference

All endpoints require `Authorization: Bearer <token>` where token is either an OTR API key or a session token from the Autonomous page.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/autonomous/market-intel` | Live RWA prices + vault state + P&L summary |
| `GET`  | `/api/autonomous/vault` | Current vault config and status |
| `POST` | `/api/autonomous/vault` | Update vault config or status |
| `GET`  | `/api/autonomous/api-keys` | List active OTR keys |
| `POST` | `/api/autonomous/api-keys` | Generate a new OTR key |
| `DELETE` | `/api/autonomous/api-keys/:id` | Revoke an OTR key |

### market-intel response shape

```json
{
  "timestamp": "2026-07-19T06:00:00.000Z",
  "vault": {
    "agentAddress": "0x...",
    "status": "running",
    "strategyConfig": {
      "token": "AAPL",
      "strategy": "dca",
      "budget_eth": "0.002",
      "tp_pct": "15",
      "sl_pct": "5",
      "entry_type": "market",
      "max_concurrent": "1"
    },
    "totalTrades": 0,
    "totalPnlUsd": 0,
    "updatedAt": "2026-07-19T05:00:00.000Z"
  },
  "market": {
    "AAPL": { "priceUsd": 334.92, "tokenAddress": "0x...", "name": "Apple Inc.", "priceAgeMs": 4200 },
    "NVDA": { "priceUsd": 202.60, "tokenAddress": "0x...", "name": "NVIDIA Corp.", "priceAgeMs": 4200 }
  },
  "targetToken": "AAPL",
  "targetPrice": 334.92,
  "tokenCount": 20,
  "summary": "Vault status: running. Strategy: dca on AAPL. Budget: 0.002 ETH/trade. TP: +15% / SL: -5%. Target price: $334.92. Total trades: 0. Total P&L: $0.00."
}
```

---

## Supported RWA Tokens

| Ticker | Name |
|--------|------|
| AAPL | Apple Inc. |
| NVDA | NVIDIA Corp. |
| TSLA | Tesla Inc. |
| GOOGL | Alphabet Inc. |
| META | Meta Platforms Inc. |
| MSFT | Microsoft Corp. |
| AMZN | Amazon.com Inc. |
| AMD | Advanced Micro Devices |
| PLTR | Palantir Technologies |
| ORCL | Oracle Corp. |
| SPY | SPDR S&P 500 ETF |
| MU | Micron Technology |
| SPCX | Procure Space ETF |
| QQQ | Invesco QQQ ETF |
| COIN | Coinbase Global |
| INTC | Intel Corp. |
| CRWV | CoreWeave Inc. |
| USO | United States Oil Fund |
| BE | Bloom Energy |
| USAR | USA Rare Earth |
