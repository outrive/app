#!/usr/bin/env node
/**
 * OUTRIVE — Live $1 RWA buy test using treasury/deployer wallet.
 * Uses FlapPortal on Robinhood Chain (chainId 4663).
 * Requires: DEPLOYER_PRIVATE_KEY env var
 *
 * Usage: node scripts/test-buy-1usd.mjs [SYMBOL]
 *   SYMBOL defaults to NVDA
 */

// Run from repo root: node scripts/test-buy-1usd.mjs [SYMBOL]
// Requires viem in PATH — install globally or: cd artifacts/api-server && node ../scripts/test-buy-1usd.mjs
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem/utils';

/* ── Chain definition ───────────────────────────────────────────────────── */
const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
});

/* ── Constants ──────────────────────────────────────────────────────────── */
const RPC_URL     = 'https://rpc.mainnet.chain.robinhood.com';
const FLAP_PORTAL = '0xC94135b63772b91D79d0A2DaAb2a8801f32359bD';
const _ETH_SENT   = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const _USDG_HEX   = '5fc5360d0400a0fd4f2af552add042d716f1d168';
const _WETH_HEX   = '0bd7d308f8e1639fab988df18a8011f41eacad73';
const _WUSDG_V3   = '52e65b17fb6e5ba00ed806f37afcd2daa50271ca';
const _FLAP_HEX   = 'c94135b63772b91d79d0a2daab2a8801f32359bd';
const WETH_FROM   = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
const SWAP_SEL    = '0x77963966';
const UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/* ── Token registry ─────────────────────────────────────────────────────── */
const TOKENS = {
  NVDA:  { address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', pool: '0x682fd352329026885366d6649d61cb4ee505e7a4', name: 'NVIDIA Corp.' },
  AAPL:  { address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', pool: '0x957bb4b86ccc706d44983fb889ed63c6f9bdc662', name: 'Apple Inc.' },
  MSFT:  { address: '0xe93237C50D904957Cf27E7B1133b510C669c2e74', pool: '0xee3045339447359e6c021ed63537305debdbd610', name: 'Microsoft Corp.' },
  GOOGL: { address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', pool: '0x7da0e2609e8dcf31055a8710465516056cf96e64', name: 'Alphabet Inc.' },
  SPY:   { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', pool: '0x434dc3ed0aed78385b34041e7836c867c6790844', name: 'SPDR S&P 500' },
};

/* ── ABI helpers ────────────────────────────────────────────────────────── */
const hexAddr = s => '000000000000000000000000' + s.replace(/^0x/i,'').toLowerCase().padStart(40,'0');
const hexU    = n => BigInt(n).toString(16).padStart(64,'0');
const HZ      = '0'.repeat(64);

function buildFlapBuyCalldata(stock, pool, ethWei, minOut, recipient, deadline) {
  const stockHex = stock.replace(/^0x/i,'').toLowerCase();
  const poolHex  = pool.replace(/^0x/i,'').toLowerCase();
  const recpHex  = recipient.replace(/^0x/i,'').toLowerCase();
  const cb   = '2203d44a' + hexU(0) + hexU(0) + hexU(minOut) + hexAddr(_FLAP_HEX) + hexU(deadline) + '0'.repeat(56);
  const head = hexAddr(_ETH_SENT) + hexAddr(stockHex) + hexU(ethWei) + hexU(minOut) + hexAddr(recpHex) + hexU(deadline)
             + HZ + HZ + HZ + HZ + HZ + hexU(0x180);
  const rh   = hexU(2) + hexU(0x40) + hexU(0x1a0);
  const r0   = hexU(2) + hexAddr(_WUSDG_V3) + hexAddr(_WETH_HEX) + hexAddr(_USDG_HEX) + hexU(ethWei) + HZ + HZ + hexU(0x120) + HZ + hexU(32) + hexU(100);
  const r1   = HZ + hexAddr(poolHex) + hexAddr(_USDG_HEX) + hexAddr(stockHex) + HZ + HZ + hexU(minOut) + hexU(0x120) + hexU(36) + hexU(164) + cb;
  return SWAP_SEL + head + rh + r0 + r1;
}

async function rpcCall(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  return r.json();
}

function fmt(wei, decimals = 18, dp = 6) {
  const d = Number(BigInt(wei)) / 10 ** decimals;
  return d.toFixed(dp);
}

/* ── Main ───────────────────────────────────────────────────────────────── */
async function main() {
  const symbol = (process.argv[2] ?? 'NVDA').toUpperCase();
  const token  = TOKENS[symbol];
  if (!token) { console.error(`Unknown symbol: ${symbol}. Available: ${Object.keys(TOKENS).join(', ')}`); process.exit(1); }

  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) { console.error('DEPLOYER_PRIVATE_KEY not set'); process.exit(1); }

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  OUTRIVE · Treasury Wallet Live Buy Test');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Wallet : ${account.address}`);
  console.log(`  Token  : ${symbol} (${token.name})`);
  console.log(`  Target : $1.00 USD`);

  /* ── Step 1: ETH price ──────────────────────────────────────────────── */
  console.log('\n[1/6] Fetching ETH price...');
  let ethUsd = 1828;
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { const d = await r.json(); ethUsd = d?.ethereum?.usd ?? ethUsd; }
  } catch { /* use fallback */ }
  console.log(`  ETH/USD = $${ethUsd.toFixed(2)}`);

  const usdTarget  = 1.00;
  const ethNeeded  = usdTarget / ethUsd;
  const ethWei     = BigInt(Math.floor(ethNeeded * 1e18));
  console.log(`  $1.00 ≈ ${ethNeeded.toFixed(8)} ETH (${ethWei} wei)`);

  /* ── Step 2: Wallet ETH balance ─────────────────────────────────────── */
  console.log('\n[2/6] Checking wallet balance...');
  const balRes = await rpcCall('eth_getBalance', [account.address, 'latest']);
  const balWei = BigInt(balRes?.result ?? '0x0');
  const balEth = Number(balWei) / 1e18;
  console.log(`  Balance: ${balEth.toFixed(6)} ETH ($${(balEth * ethUsd).toFixed(2)} USD)`);

  if (balWei < ethWei * 2n) {
    console.error(`\n  ✗ Insufficient balance — need at least ${(ethNeeded * 2).toFixed(6)} ETH for tx + gas`);
    process.exit(1);
  }

  /* ── Step 3: Buy quote via eth_call (ref 0.01 ETH, scale to $1) ─────── */
  console.log('\n[3/6] Getting live buy quote from FlapPortal...');
  const REF_ETH  = 10n ** 16n; // 0.01 ETH
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const quoteData = buildFlapBuyCalldata(
    token.address, token.pool, REF_ETH, 1n, WETH_FROM, deadline
  );
  const quoteRes = await rpcCall('eth_call', [
    { from: WETH_FROM, to: FLAP_PORTAL, data: quoteData, value: '0x' + REF_ETH.toString(16) },
    'latest',
  ]);
  if (!quoteRes?.result || quoteRes.result === '0x') {
    console.error('  ✗ Quote failed:', JSON.stringify(quoteRes?.error ?? quoteRes));
    process.exit(1);
  }
  const refAmountOut = BigInt(quoteRes.result.slice(0, 66)); // first 32 bytes = amountOut
  console.log(`  REF: 0.01 ETH → ${fmt(refAmountOut, 18, 8)} ${symbol} shares`);

  // Scale to our actual ETH amount
  const scaledAmountOut = (refAmountOut * ethWei) / REF_ETH;
  const slippage        = 5n; // 5% slippage tolerance
  const minOut          = (scaledAmountOut * (100n - slippage)) / 100n;
  const pricePerShare   = usdTarget / (Number(scaledAmountOut) / 1e18);
  console.log(`  For $1.00 (${ethNeeded.toFixed(8)} ETH):`);
  console.log(`    Expected out  : ${fmt(scaledAmountOut, 18, 8)} ${symbol}`);
  console.log(`    Min out (5%)  : ${fmt(minOut, 18, 8)} ${symbol}`);
  console.log(`    Implied price : $${pricePerShare.toFixed(2)} per share`);

  /* ── Step 4: Gas estimate ───────────────────────────────────────────── */
  console.log('\n[4/6] Estimating gas...');
  const txDeadline = Math.floor(Date.now() / 1000) + 1800; // 30 min for actual tx
  const calldata   = buildFlapBuyCalldata(
    token.address, token.pool, ethWei, minOut, account.address, txDeadline
  );
  let gasLimit = 500_000n;
  try {
    const estRes = await rpcCall('eth_estimateGas', [{
      from: account.address, to: FLAP_PORTAL,
      data: calldata, value: '0x' + ethWei.toString(16),
    }]);
    if (estRes?.result) {
      gasLimit = BigInt(estRes.result) * 130n / 100n; // +30% buffer
      console.log(`  Estimated gas : ${(BigInt(estRes.result)).toString()} (+30% → ${gasLimit.toString()})`);
    }
  } catch (e) { console.log(`  Gas estimate failed (${e.message}), using 500k`); }

  // Gas price — add 20% buffer so maxFeePerGas > baseFee
  const gpRes    = await rpcCall('eth_gasPrice', []);
  const rawGp    = BigInt(gpRes?.result ?? '0x3B9ACA00');
  const gasPrice = rawGp * 120n / 100n;  // +20% above reported gas price
  const gasCost  = gasLimit * gasPrice;
  console.log(`  Gas price     : ${fmt(gasPrice, 9, 4)} gwei`);
  console.log(`  Max gas cost  : ${fmt(gasCost, 18, 6)} ETH ($${(Number(gasCost) / 1e18 * ethUsd).toFixed(4)})`);

  /* ── Step 5: Send transaction ───────────────────────────────────────── */
  console.log('\n[5/6] Broadcasting transaction...');

  // Get nonce
  const nonceRes = await rpcCall('eth_getTransactionCount', [account.address, 'latest']);
  const nonce    = Number(nonceRes?.result ?? '0x0');
  console.log(`  Nonce: ${nonce}`);

  // Sign tx manually using eth_signTransaction via viem wallet client
  const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(RPC_URL),
  });

  const txHash = await walletClient.sendTransaction({
    to:       FLAP_PORTAL,
    data:     calldata,
    value:    ethWei,
    gas:      gasLimit,
    gasPrice,
    nonce,
    chain:    robinhoodChain,
  });

  console.log(`  ✓ TX sent: ${txHash}`);
  console.log(`  Explorer: https://robinhoodchain.blockscout.com/tx/${txHash}`);

  /* ── Step 6: Wait for receipt ───────────────────────────────────────── */
  console.log('\n[6/6] Waiting for receipt (up to 60s)...');
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const recRes = await rpcCall('eth_getTransactionReceipt', [txHash]);
    if (recRes?.result) { receipt = recRes.result; break; }
    process.stdout.write('.');
  }
  console.log('');

  if (!receipt) {
    console.log('  ⏳ Receipt not yet available (tx still pending)');
    console.log(`  Check: https://robinhoodchain.blockscout.com/tx/${txHash}`);
  } else {
    const success = receipt.status === '0x1';
    const gasUsed = BigInt(receipt.gasUsed);
    const gasPaid = gasUsed * gasPrice;
    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  STATUS      : ${success ? '✅  SUCCESS' : '❌  REVERTED'}`);
    console.log(`  Block       : ${Number(receipt.blockNumber)}`);
    console.log(`  Gas used    : ${gasUsed.toString()}`);
    console.log(`  Gas cost    : ${fmt(gasPaid, 18, 8)} ETH ($${(Number(gasPaid) / 1e18 * ethUsd).toFixed(4)})`);
    console.log(`  ETH spent   : ${fmt(ethWei + gasPaid, 18, 8)} ETH (swap + gas)`);
    if (success) {
      console.log(`  ${symbol} received : ~${fmt(scaledAmountOut, 18, 8)} shares`);
      console.log(`  Implied px  : ~$${pricePerShare.toFixed(2)}`);
    }
    console.log(`  TX hash     : ${txHash}`);
    console.log(`  Explorer    : https://robinhoodchain.blockscout.com/tx/${txHash}`);
    console.log('══════════════════════════════════════════════════════\n');
  }
}

main().catch(e => { console.error('\n✗ Fatal:', e); process.exit(1); });
