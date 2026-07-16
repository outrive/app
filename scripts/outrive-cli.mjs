#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// OUTRIVE CLI — Terminal interface for the OUTRIVE AI agent
// Requires Node.js 18+ (native fetch + crypto). No npm install needed.
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

// ─── ASCII art ────────────────────────────────────────────────────────────────
const ASCII_LOGO = `${C.lime}${C.bold}
  ██████╗ ██╗   ██╗████████╗██████╗ ██╗██╗   ██╗███████╗
  ██╔═══██╗██║   ██║╚══██╔══╝██╔══██╗██║██║   ██║██╔════╝
  ██║   ██║██║   ██║   ██║   ██████╔╝██║╚██╗ ██╔╝█████╗
  ██║   ██║██║   ██║   ██║   ██╔══██╗██║ ╚████╔╝ ██╔══╝
  ╚██████╔╝╚██████╔╝   ██║   ██║  ██║██║  ╚██╔╝  ███████╗
   ╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝${C.reset}`;

const BOX_WIDTH = 62;

function boxLine(content = "", color = C.gray) {
  // Strip ANSI for length calculation
  const plain = content.replace(/\x1b\[[0-9;]*m/g, "");
  const pad   = Math.max(0, BOX_WIDTH - 2 - plain.length);
  return `${C.gray}║${C.reset}  ${content}${" ".repeat(pad)}${C.gray}║${C.reset}`;
}
function boxTop()    { return `${C.gray}╔${"═".repeat(BOX_WIDTH)}╗${C.reset}`; }
function boxDiv()    { return `${C.gray}╠${"═".repeat(BOX_WIDTH)}╣${C.reset}`; }
function boxBottom() { return `${C.gray}╚${"═".repeat(BOX_WIDTH)}╝${C.reset}`; }

function printDashboard(cfg, apiStatus) {
  const wallet  = cfg?.walletAddress  ?? "—";
  const apiUrl  = cfg?.apiUrl          ?? "—";
  const online  = apiStatus?.ok;
  const factory = apiStatus?.body?.factoryAddress ?? "—";
  const chain   = apiStatus?.body?.chainId         ?? 4663;

  const short = (s) => s.length > 44 ? s.slice(0, 20) + "…" + s.slice(-20) : s;

  console.log();
  console.log(boxTop());
  console.log(boxLine());
  // Logo lines (strip per-line)
  const logoLines = ASCII_LOGO.trim().split("\n");
  for (const ll of logoLines) {
    const plain = ll.replace(/\x1b\[[0-9;]*m/g, "");
    const pad   = Math.max(0, BOX_WIDTH - 2 - plain.length);
    console.log(`${C.gray}║${C.reset}  ${ll}${" ".repeat(pad)}${C.gray}║${C.reset}`);
  }
  console.log(boxLine());
  console.log(boxLine(`${C.gray}AI AGENT CLI           ROBINHOOD CHAIN · VIRTUALS PROTOCOL${C.reset}`));
  console.log(boxLine());
  console.log(boxDiv());
  console.log(boxLine(`${C.gray}WALLET ${C.reset}  ${C.white}${C.bold}${short(wallet)}${C.reset}`));
  console.log(boxLine(`${C.gray}API    ${C.reset}  ${C.white}${short(apiUrl)}${C.reset}`));
  console.log(boxLine(`${C.gray}NETWORK${C.reset}  ${C.white}Robinhood Chain (chainId ${chain})${C.reset}`));
  if (factory !== "—") {
    console.log(boxLine(`${C.gray}FACTORY${C.reset}  ${C.gray}${short(factory)}${C.reset}`));
  }
  console.log(boxLine(
    online
      ? `${C.gray}STATUS ${C.reset}  ${C.lime}${C.bold}● ONLINE${C.reset}`
      : `${C.gray}STATUS ${C.reset}  ${C.red}${C.bold}● UNREACHABLE${C.reset}`
  ));
  console.log(boxDiv());
  console.log(boxLine(`${C.gray}buy    ${C.reset}${C.cyan}<eth>${C.reset}  ${C.gray}<address>  [--name N] [--ticker T]${C.reset}`));
  console.log(boxLine(`${C.gray}sell   ${C.reset}${C.cyan}<amt>${C.reset}  ${C.gray}<address>  [--name N] [--ticker T]${C.reset}`));
  console.log(boxLine(`${C.cyan}chat   ${C.reset}${C.gray}"<message>"${C.reset}`));
  console.log(boxLine(`${C.gray}logout${C.reset}`));
  console.log(boxBottom());
  console.log();
}

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

  row("Side",      p.side.toUpperCase());
  row("Token",     `${p.tokenName} ($${p.tokenTicker})`);
  row("Address",   p.tokenAddress);
  row("Amount In", p.amountIn);
  row("Min Out",   p.amountOutMin);
  row("Protocol",  protoLabels[p.protocol] ?? p.protocol);
  row("Network",   p.network);
  row("Slippage",  `${p.slippage}%`);

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
    console.log(fmt.info("Enter your OUTRIVE API URL"));
    console.log(fmt.dim("  e.g. https://outrive.io/api-server"));
    apiUrl = (await rl.question(`  ${C.cyan}API URL:${C.reset} `)).trim().replace(/\/$/, "");

    if (!apiUrl.startsWith("http")) {
      console.log(fmt.err("URL must start with http:// or https://"));
      process.exit(1);
    }

    console.log();
    console.log(fmt.info("Enter your OUTRIVE web app URL"));
    console.log(fmt.dim("  e.g. https://outrive.io/outrive"));
    appUrl = (await rl.question(`  ${C.cyan}App URL:${C.reset} `)).trim().replace(/\/$/, "");
  } finally {
    rl.close();
  }

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
  console.log(boxTop());
  console.log(boxLine(`${C.lime}${C.bold}Open this URL in your browser to authorize:${C.reset}`));
  console.log(boxLine());
  // Split long URL across lines if needed
  const urlStr = `${C.cyan}${C.bold}${authUrl}${C.reset}`;
  const urlPlain = authUrl;
  if (urlPlain.length <= BOX_WIDTH - 4) {
    console.log(boxLine(`${C.cyan}${C.bold}${authUrl}${C.reset}`));
  } else {
    // Print outside box if too long
    console.log(`${C.gray}╚${"═".repeat(BOX_WIDTH)}╝${C.reset}`);
    console.log();
    console.log(`  ${C.cyan}${C.bold}${authUrl}${C.reset}`);
    console.log();
  }
  if (urlPlain.length <= BOX_WIDTH - 4) {
    console.log(boxLine());
    console.log(boxLine(`${C.gray}Connect wallet → sign message → done${C.reset}`));
    console.log(boxBottom());
  }

  console.log();
  console.log(fmt.dim("Waiting for confirmation (timeout: 5 min)…"));
  console.log();

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
      console.log(fmt.info("Run: outrive status  to see the dashboard"));
      return;
    }

    if (poll.body?.status === "expired") {
      console.log(fmt.err("Session expired. Run outrive auth again."));
      process.exit(1);
    }

    process.stdout.write(".");
  }

  console.log();
  console.log(fmt.err("Timed out waiting for authorization. Run outrive auth again."));
  process.exit(1);
}

// ── status ────────────────────────────────────────────────────────────────────
async function cmdStatus() {
  const cfg = await loadConfig();
  if (!cfg?.walletAddress) {
    console.log(fmt.warn("Not authorized. Run: node outrive-cli.mjs auth"));
    return;
  }

  const sp = spinner("Fetching API status…");
  const res = await apiGet(cfg.apiUrl, "/api/system/status").catch(() => null);
  sp.stop("");

  printDashboard(cfg, res);
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
  if (!cfg?.walletAddress) { console.log(fmt.warn("Not authorized. Run: node outrive-cli.mjs auth")); return; }

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
  console.log(fmt.info(`Buy ${C.bold}${ethAmount} ETH${C.reset} of ${C.lime}${C.bold}$${tokenTicker}${C.reset}`));

  const message = `buy ${ethAmount} eth of ${tokenName} token at address ${tokenAddress}`;
  await runChat(cfg, message);
}

// ── sell ──────────────────────────────────────────────────────────────────────
async function cmdSell(args) {
  const cfg = await loadConfig();
  if (!cfg?.walletAddress) { console.log(fmt.warn("Not authorized. Run: node outrive-cli.mjs auth")); return; }

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
  console.log(fmt.info(`Sell ${C.bold}${Number(tokenAmount).toLocaleString()} ${C.lime}$${tokenTicker}${C.reset}`));

  const message = `sell ${tokenAmount} ${tokenName} token at address ${tokenAddress}`;
  await runChat(cfg, message);
}

// ── chat ──────────────────────────────────────────────────────────────────────
async function cmdChat(args) {
  const cfg = await loadConfig();
  if (!cfg?.walletAddress) { console.log(fmt.warn("Not authorized. Run: node outrive-cli.mjs auth")); return; }

  const message = args.join(" ");
  if (!message.trim()) {
    console.log(fmt.err('Usage: outrive chat "<your message>"'));
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
  console.log(fmt.ok("Logged out. Run outrive auth to reconnect."));
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  console.log();
  console.log(ASCII_LOGO);
  console.log();
  console.log(boxTop());
  console.log(boxLine(`${C.gray}AI-NATIVE TERMINAL INTERFACE FOR VIRTUALS PROTOCOL${C.reset}`));
  console.log(boxLine(`${C.gray}ROBINHOOD CHAIN · NODE 18+ · ZERO INSTALL${C.reset}`));
  console.log(boxDiv());
  console.log(boxLine(`${C.lime}${C.bold}COMMANDS${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.cyan}auth${C.reset}                     ${C.gray}Authorize via wallet (one-time)${C.reset}`));
  console.log(boxLine(`  ${C.cyan}status${C.reset}                   ${C.gray}Show dashboard (wallet, API, network)${C.reset}`));
  console.log(boxLine(`  ${C.cyan}buy${C.reset}  ${C.white}<eth> <address>${C.reset}    ${C.gray}Buy tokens with ETH${C.reset}`));
  console.log(boxLine(`  ${C.cyan}sell${C.reset} ${C.white}<amt> <address>${C.reset}    ${C.gray}Sell tokens for ETH${C.reset}`));
  console.log(boxLine(`  ${C.cyan}chat${C.reset} ${C.white}"<message>"${C.reset}        ${C.gray}Free-form AI agent command${C.reset}`));
  console.log(boxLine(`  ${C.cyan}logout${C.reset}                   ${C.gray}Remove stored credentials${C.reset}`));
  console.log(boxLine(`  ${C.cyan}help${C.reset}                     ${C.gray}Show this screen${C.reset}`));
  console.log(boxDiv());
  console.log(boxLine(`${C.lime}${C.bold}OPTIONS  ${C.reset}${C.gray}(for buy / sell)${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.gray}--name   <NAME>   ${C.reset}Token name for agent context`));
  console.log(boxLine(`  ${C.gray}--ticker <TICKER> ${C.reset}Token ticker symbol`));
  console.log(boxDiv());
  console.log(boxLine(`${C.lime}${C.bold}EXAMPLES${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.gray}# authorize once${C.reset}`));
  console.log(boxLine(`  ${C.white}node outrive-cli.mjs auth${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.gray}# buy 0.05 ETH of OTR${C.reset}`));
  console.log(boxLine(`  ${C.white}node outrive-cli.mjs buy 0.05 0xd1c262... \\${C.reset}`));
  console.log(boxLine(`  ${C.white}    --name OTR --ticker OTR${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.gray}# sell 1M OTR${C.reset}`));
  console.log(boxLine(`  ${C.white}node outrive-cli.mjs sell 1000000 0xd1c262...${C.reset}`));
  console.log(boxLine());
  console.log(boxLine(`  ${C.gray}# ask the agent${C.reset}`));
  console.log(boxLine(`  ${C.white}node outrive-cli.mjs chat "what's trending?"${C.reset}`));
  console.log(boxDiv());
  console.log(boxLine(`${C.gray}CONFIG    ${C.reset}${CONFIG_FILE}`));
  console.log(boxLine(`${C.gray}DOCS      ${C.reset}open the OUTRIVE app → CLI tab`));
  console.log(boxBottom());
  console.log();
}

// ─── Entry point ──────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

// Tiny banner (not the full logo — that's in help/status)
process.stdout.write(`${C.lime}${C.bold}OUTRIVE${C.reset} ${C.gray}cli${C.reset}\n`);

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
    cmdHelp();
    break;
  default:
    console.log(fmt.err(`Unknown command: ${cmd}`));
    console.log(fmt.dim("Run: node outrive-cli.mjs help"));
    process.exit(1);
}
