/**
 * Deploy OTRCreditPool to Robinhood Mainnet
 * Usage: DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-credit-pool.mjs
 *
 * After deploy, set env var:
 *   OTR_CREDIT_POOL_ADDRESS=<deployed address>
 *   OTR_TOKEN_ADDRESS=0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef
 *   VITE_OTR_CREDIT_POOL_ADDRESS=<same as above>
 *   VITE_OTR_TOKEN_ADDRESS=0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
});

const OTR_TOKEN_ADDRESS = process.env.OTR_TOKEN_ADDRESS ?? "0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error("Error: DEPLOYER_PRIVATE_KEY env var is required");
  process.exit(1);
}

// Load compiled contract
const artifact = JSON.parse(
  readFileSync(join(__dirname, "../contracts/OTRCreditPool.json"), "utf-8")
);
const { abi, bytecode } = artifact;

const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
console.log(`Deployer: ${account.address}`);
console.log(`OTR Token: ${OTR_TOKEN_ADDRESS}`);
console.log(`Chain: Robinhood Mainnet (4663)`);

const walletClient = createWalletClient({
  account,
  chain: robinhoodMainnet,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: robinhoodMainnet,
  transport: http(),
});

// Check deployer balance
const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer ETH balance: ${Number(balance) / 1e18} ETH`);
if (balance === 0n) {
  console.error("Error: Deployer has no ETH for gas");
  process.exit(1);
}

// Deploy
console.log("\nDeploying OTRCreditPool...");
const hash = await walletClient.deployContract({
  abi,
  bytecode: `0x${bytecode}`,
  args: [OTR_TOKEN_ADDRESS],
});
console.log(`Deploy TX: ${hash}`);
console.log("Waiting for confirmation...");

const receipt = await publicClient.waitForTransactionReceipt({ hash });
const contractAddress = receipt.contractAddress;

if (!contractAddress) {
  console.error("Deployment failed — no contract address in receipt");
  process.exit(1);
}

console.log(`\n✓ OTRCreditPool deployed at: ${contractAddress}`);
console.log(`\nSet these env vars:`);
console.log(`  OTR_CREDIT_POOL_ADDRESS=${contractAddress}`);
console.log(`  OTR_TOKEN_ADDRESS=${OTR_TOKEN_ADDRESS}`);
console.log(`  VITE_OTR_CREDIT_POOL_ADDRESS=${contractAddress}`);
console.log(`  VITE_OTR_TOKEN_ADDRESS=${OTR_TOKEN_ADDRESS}`);
console.log(`\nBlockscout: https://robinhoodchain.blockscout.com/address/${contractAddress}`);
