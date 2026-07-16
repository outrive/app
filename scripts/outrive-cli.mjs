#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// OUTRIVE CLI — Terminal interface for the OUTRIVE AI agent
// Requires Node.js 18+ (native fetch + crypto). No npm install needed.
//
// Usage:
//   node outrive-cli.mjs auth               # Authorize via wallet (one-time)
//   node outrive-cli.mjs status             # Show connection status
//   node outrive-cli.mjs buy 0.05 0xTOKEN   # Buy tokens with ETH
//   node outrive-cli.mjs sell 1000000 0xTOK # Sell tokens for ETH
//   node outrive-cli.mjs chat "message"     # Free-form agent chat
//   node outrive-cli.mjs logout             # Remove credentials
//   node outrive-cli.mjs help               # Show this help
// ═══════════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync }                 from "node:fs";
import { homedir }                    from "node:os";
import { join }                       from "node:path";
import { randomUUID }                 from "node:crypto";
import * as readline                  from "node:readline/promises";

// ─── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  lime:    "\x1b[92m",
  yellow:  "\x1b[33m",
  cyan:    "\x1b[36m",
  red:     "\x1b[31m",
  gray:    "\x1b[90m",
  white:   "\x1b[97m",
  magenta: "\x1b[35m",
};

const fmt = {
  ok:     (s) => `${C.lime}${C.bold}✓${C.reset} ${C.white}${s}${C.reset}`,
  err:    (s) => `${C.red}${C.bold}✗${C.reset} ${C.red}${s}${C.reset}`,
  warn:   (s) => `${C.yellow}⚠${C.reset} ${C.yellow}${s}${C.reset}`,
  info:   (s) => `${C.cyan}→${C.reset} ${s}`,
  label:  (s) => `${C.gray}${s}${C.reset}`,
  value:  (s) => `${C.white}${C.bold}${s}${C.reset}`,
  accent: (s) => `${C.lime}${C.bold}${s}${C.reset}`,
  dim:    (s) => `${C.gray}${s}${C.reset}`,
};

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_DIR  = join(homedir(), ".outrive");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveConfig(cfg) {
  if (!existsSync(CONFIG_DIR)) await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiGet(apiUrl, path) {
  const res = await fetch(`${apiUrl}${path}`);
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

async function apiPost(apiUrl, path, body) {
  const res = await fetch(`${apiUrl}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

// ─── SSE stream parser for /api/chat ──────────────────────────────────────────
async function* streamChat(apiUrl, messages, walletAddress) {
  const res = await fetch(`${apiUrl}/api/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages, walletAddress, sessionId: `cli-${Date.now()}` }),
  });

  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    yield { type: "credits_required", ...body };
    return;
  }
  if (!res.ok || !res.body) {
    yield { type: "error", message: `HTTP ${res.status}` };
    return;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch { /* skip */ }
      }
    }
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function spinner(label) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${C.cyan}${frames[i++ % frames.length]}${C.reset} ${C.gray}${label}${C.reset}`);
  }, 80);
  return {
    stop: (msg = "") => {
      clearInterval(interval);
      process.stdout.write(`\r\x1b[2K${msg}\n`);
    },
  };
}

// ─── Work Order display ───────────────────────────────────────────────────────
function printWorkOrder(event) {
  const p = event.preview;
  const protoLabels = {
    bonding_curve:         "Virtuals ETH Bonding Curve",
    virtual_bonding_curve: "Virtuals Bonding Curve ($VIRTUAL)",
    uniswap_v3:            "Uniswap V3",
    uniswap_v4:            "Uniswap V4",
    uniswap_v2:            "Uniswap V2",
  };

  console.log();
  console.log(`${C.lime}${C.bold}╔══════════════════════════════════════╗`);
  console.log(`║         OUTRIVE WORK ORDER           ║`);
  console.log(`╚══════════════════════════════════════╝${C.reset}`);
  console.log();

  const row = (label, val) =>
    console.log(`  ${C.gray}${label.padEnd(14)}${C.reset} ${C.white}${val}${C.reset}`);

  row("Side",     p.side.toUpperCase());
  row("Token",    `${p.tokenName} ($${p.tokenTicker})`);
  row("Address",  p.tokenAddress);
  row("Amount In", p.amountIn);
  row("Min Out",  p.amountOutMin);
  row("Protocol", protoLabels[p.protocol] ?? p.protocol);
  row("Network",  p.network);
  row("Slippage", `${p.slippage}%`);

  console.log();
  console.log(`${C.bold}  Raw Transactions${C.reset}`);
  console.log();

  if (event.needsApprove && event.approveTx) {
    console.log(`  ${C.yellow}[1/2] Approve tx${C.reset}`);
    console.log(`  ${C.gray}to:${C.reset}    ${event.approveTx.to}`);
    console.log(`  ${C.gray}data:${C.reset}  ${event.approveTx.data.slice(0, 66)}…`);
    console.log();
    console.log(`  ${C.lime}[2/2] Trade tx${C.reset}`);
  } else {
    console.log(`  ${C.lime}Trade tx${C.reset}`);
  }

  console.log(`  ${C.gray}to:${C.reset}    ${event.tradeTx.to}`);
  console.log(`  ${C.gray}data:${C.reset}  ${event.tradeTx.data.slice(0, 66)}…`);
  console.log(`  ${C.gray}value:${C.reset} ${event.tradeTx.value} wei`);
  console.log();

  if (event.needsApprove) {
    console.log(fmt.warn("Send the approve tx first, then the trade tx in your wallet."));
  } else {
    console.log(fmt.info("Sign and broadcast the trade tx in your wallet to execute."));
  }
  console.log();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

// ── auth ──────────────────────────────────────────────────────────────────────
async function cmdAuth() {
  console.log();
  console.log(fmt.accent("OUTRIVE CLI — Wallet Authorization"));
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let apiUrl = "";
  let appUrl = "";
  try {
    console.log(fmt.info("Enter your OUTRIVE API URL (the API server base URL, e.g. https://xxxxx.replit.dev/api-server)"));
    apiUrl = (await rl.question(`  ${C.cyan}API URL:${C.reset} `)).trim().replace(/\/$/, "");

    if (!apiUrl.startsWith("http")) {
      console.log(fmt.err("URL must start with http:// or https://"));
      process.exit(1);
    }

    console.log();
    console.log(fmt.info("Enter your OUTRIVE web app URL (e.g. https://xxxxx.replit.dev/outrive)"));
    appUrl = (await rl.question(`  ${C.cyan}App URL:${C.reset} `)).trim().replace(/\/$/, "");
  } finally {
    rl.close();
  }

  // Generate session ID and register it
  const sessionId = randomUUID();

  const sp = spinner("Registering session…");
  const reg = await apiPost(apiUrl, "/api/cli/auth/request", { sessionId });
  sp.stop();

  if (!reg.ok) {
    console.log(fmt.err(`Failed to register session: ${reg.body?.error ?? reg.status}`));
    process.exit(1);
  }

  const authUrl = `${appUrl}/cli-auth?session=${sessionId}`;

  console.log();
  console.log(`${C.lime}${C.bold}Open this URL in your browser to authorize:${C.reset}`);
  console.log();
  console.log(`  ${C.cyan}${C.bold}${authUrl}${C.reset}`);
  console.log();
  console.log(fmt.dim("Connect your wallet and sign the authorization message. Waiting…"));
  console.log();

  // Poll every 2 s for up to 5 min
  const started = Date.now();
  while (Date.now() - started < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await apiGet(apiUrl, `/api/cli/auth/poll/${sessionId}`).catch(() => null);
    if (!poll) continue;

    if (poll.body?.status === "confirmed") {
      const walletAddress = poll.body.walletAddress;
      await saveConfig({ apiUrl, appUrl, walletAddress, sessionId });

      console.log(fmt.ok("Authorization successful!"));
      console.log();
      console.log(`  ${fmt.label("Wallet")}   ${fmt.value(walletAddress)}`);
      console.log(`  ${fmt.label("API URL")}  ${fmt.value(apiUrl)}`);
      console.log(`  ${fmt.label("Config")}   ${fmt.value(CONFIG_FILE)}`);
      console.log();
      console.log(fmt.info("You can now run: outrive buy / sell / chat"));
      return;
    }

    if (poll.body?.status === "expired") {
      console.log(fmt.err("Session expired. Run `outrive auth` again."));
      process.exit(1);
    }

    process.stdout.write(".");
  }

  console.log();
  console.log(fmt.err("Timed out waiting for authorization. Run `outrive auth` again."));
  process.exit(1);
}

// ── status ────────────────────────────────────────────────────────────────────
async function cmdStatus() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.log(fmt.warn("Not authorized. Run: outrive auth"));
    return;
  }

  console.log();
  console.log(`  ${fmt.label("Wallet")}   ${fmt.value(cfg.walletAddress)}`);
  console.log(`  ${fmt.label("API URL")}  ${fmt.value(cfg.apiUrl)}`);
  console.log();

  const sp = spinner("Checking API…");
  const res = await apiGet(cfg.apiUrl, "/api/system/status").catch(() => null);
  sp.stop();

  if (!res?.ok) {
    console.log(fmt.err("API unreachable — check your API URL."));
    return;
  }

  const s = res.body;
  console.log(fmt.ok("API is online"));
  if (s?.calibrated)    console.log(`  ${fmt.label("Factory")}  ${fmt.value(s.factoryAddress ?? "—")}`);
  if (s?.signerAddress) console.log(`  ${fmt.label("Signer")}   ${fmt.value(s.signerAddress)}`);
  console.log();
}

// ── chat (core) ───────────────────────────────────────────────────────────────
async function runChat(cfg, message) {
  const sp = spinner("Agent thinking…");
  let   spStopped = false;

  for await (const event of streamChat(cfg.apiUrl, [{ role: "user", content: message }], cfg.walletAddress)) {
    if (!spStopped) { sp.stop(); spStopped = true; }

    switch (event.type) {
      case "tool_call":
        if (event.status === "running") {
          process.stdout.write(`${fmt.dim(`⚙ ${event.toolName}…`)}\n`);
        } else {
          process.stdout.write(`${fmt.dim(`  done (${event.duration}ms)`)}\n`);
        }
        break;

      case "text":
        process.stdout.write(`\n${C.white}${event.content}${C.reset}\n`);
        break;

      case "tx_payload_trade":
        printWorkOrder(event);
        break;

      case "credits_required":
        console.log(fmt.err(`Credits required — free chats remaining: ${event.freeRemaining}. Top up $OTR credits.`));
        break;

      case "error":
        console.log(fmt.err(event.message));
        break;
    }
  }

  if (!spStopped) sp.stop();
  console.log();
}

// ── buy ───────────────────────────────────────────────────────────────────────
async function cmdBuy(args) {
  const cfg = await loadConfig();
  if (!cfg) { console.log(fmt.warn("Not authorized. Run: outrive auth")); return; }

  const ethAmount    = args[0];
  const tokenAddress = args[1];
  const nameIdx      = args.indexOf("--name");
  const tickerIdx    = args.indexOf("--ticker");
  const tokenName    = nameIdx   >= 0 ? args[nameIdx   + 1] : "token";
  const tokenTicker  = tickerIdx >= 0 ? args[tickerIdx + 1] : "TOKEN";

  if (!ethAmount || !tokenAddress) {
    console.log(fmt.err("Usage: outrive buy <eth_amount> <token_address> [--name NAME] [--ticker TICKER]"));
    console.log(fmt.dim("Example: outrive buy 0.05 0xd1c262... --name OTR --ticker OTR"));
    return;
  }

  console.log();
  console.log(fmt.info(`Buy ${C.bold}${ethAmount} ETH${C.reset} of ${C.bold}$${tokenTicker}${C.reset}`));

  const message = `buy ${ethAmount} eth of ${tokenName} token at address ${tokenAddress}`;
  await runChat(cfg, message);
}

// ── sell ──────────────────────────────────────────────────────────────────────
async function cmdSell(args) {
  const cfg = await loadConfig();
  if (!cfg) { console.log(fmt.warn("Not authorized. Run: outrive auth")); return; }

  const tokenAmount  = args[0];
  const tokenAddress = args[1];
  const nameIdx      = args.indexOf("--name");
  const tickerIdx    = args.indexOf("--ticker");
  const tokenName    = nameIdx   >= 0 ? args[nameIdx   + 1] : "token";
  const tokenTicker  = tickerIdx >= 0 ? args[tickerIdx + 1] : "TOKEN";

  if (!tokenAmount || !tokenAddress) {
    console.log(fmt.err("Usage: outrive sell <token_amount> <token_address> [--name NAME] [--ticker TICKER]"));
    console.log(fmt.dim("Example: outrive sell 1000000 0xd1c262... --name OTR --ticker OTR"));
    return;
  }

  console.log();
  console.log(fmt.info(`Sell ${C.bold}${Number(tokenAmount).toLocaleString()} $${tokenTicker}${C.reset}`));

  const message = `sell ${tokenAmount} ${tokenName} token at address ${tokenAddress}`;
  await runChat(cfg, message);
}

// ── chat ──────────────────────────────────────────────────────────────────────
async function cmdChat(args) {
  const cfg = await loadConfig();
  if (!cfg) { console.log(fmt.warn("Not authorized. Run: outrive auth")); return; }

  const message = args.join(" ");
  if (!message.trim()) {
    console.log(fmt.err("Usage: outrive chat \"<your message>\""));
    return;
  }

  console.log();
  await runChat(cfg, message);
}

// ── logout ────────────────────────────────────────────────────────────────────
async function cmdLogout() {
  if (!existsSync(CONFIG_FILE)) {
    console.log(fmt.warn("No credentials found."));
    return;
  }
  await writeFile(CONFIG_FILE, JSON.stringify({}));
  console.log(fmt.ok("Logged out. Run `outrive auth` to reconnect."));
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  console.log(`
${C.lime}${C.bold}OUTRIVE CLI${C.reset}  ${C.gray}— AI-powered token trading in your terminal${C.reset}

${C.bold}Usage${C.reset}
  node outrive-cli.mjs <command> [arguments]

${C.bold}Commands${C.reset}
  ${C.cyan}auth${C.reset}                         Authorize via wallet (required once)
  ${C.cyan}status${C.reset}                       Show connection and API status
  ${C.cyan}buy${C.reset} <eth> <address>           Buy tokens using ETH
  ${C.cyan}sell${C.reset} <amount> <address>       Sell tokens for ETH
  ${C.cyan}chat${C.reset} <message>                Free-form agent command
  ${C.cyan}logout${C.reset}                        Remove stored credentials
  ${C.cyan}help${C.reset}                          Show this help

${C.bold}Options${C.reset} (for buy/sell)
  --name <NAME>        Token name (for agent context, e.g. OTR)
  --ticker <TICKER>    Token ticker symbol (e.g. OTR)

${C.bold}Examples${C.reset}
  ${C.gray}# Authorize once:${C.reset}
  node outrive-cli.mjs auth

  ${C.gray}# Buy 0.05 ETH of OTR:${C.reset}
  node outrive-cli.mjs buy 0.05 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef --name OTR --ticker OTR

  ${C.gray}# Sell 1 million OTR:${C.reset}
  node outrive-cli.mjs sell 1000000 0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef --name OTR --ticker OTR

  ${C.gray}# Ask the agent anything:${C.reset}
  node outrive-cli.mjs chat "what tokens are trending right now?"

${C.bold}Config file${C.reset}
  ${C.gray}${CONFIG_FILE}${C.reset}

${C.bold}Requirements${C.reset}
  Node.js 18+  (uses native fetch + crypto — no npm install needed)
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

// Banner
console.log(`${C.bold}${C.lime}OUTRIVE${C.reset} ${C.gray}cli${C.reset}`);

switch (cmd) {
  case "auth":    await cmdAuth();        break;
  case "status":  await cmdStatus();      break;
  case "buy":     await cmdBuy(args);     break;
  case "sell":    await cmdSell(args);    break;
  case "chat":    await cmdChat(args);    break;
  case "logout":  await cmdLogout();      break;
  case "help":
  case "--help":
  case "-h":      cmdHelp();              break;
  case undefined:
    console.log(fmt.warn("No command given. Run: outrive-cli.mjs help"));
    break;
  default:
    console.log(fmt.err(`Unknown command: ${cmd}`));
    console.log(fmt.dim("Run: node outrive-cli.mjs help"));
    process.exit(1);
}
