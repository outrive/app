import { defineChain, createPublicClient, http, webSocket } from "viem";

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/v2",
    },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com",
      apiUrl: "https://explorer.testnet.chain.robinhood.com/api/v2",
    },
  },
});

export type SupportedNetwork = "mainnet" | "testnet";

export function getActiveChain(): typeof robinhoodMainnet | typeof robinhoodTestnet {
  const network = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as SupportedNetwork;
  return network === "mainnet" ? robinhoodMainnet : robinhoodTestnet;
}

export function getExplorerUrl(): string {
  const chain = getActiveChain();
  return chain.blockExplorers.default.url;
}

export function getBlockscoutApiUrl(): string {
  const chain = getActiveChain();
  return chain.blockExplorers.default.apiUrl;
}

export function getChainId(): number {
  return getActiveChain().id;
}

export function getPublicClient() {
  const chain = getActiveChain();
  const rpcUrl = process.env.RPC_URL_OVERRIDE || chain.rpcUrls.default.http[0];
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}
