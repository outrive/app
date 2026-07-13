import { createConfig } from '@privy-io/wagmi';
import { http } from 'viem';
import { robinhoodMainnet, robinhoodTestnet } from './chains';

/**
 * wagmi config managed by Privy adapter.
 * Connectors are handled entirely by PrivyProvider — no manual
 * metaMask / walletConnect / coinbaseWallet entries needed here.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodMainnet, robinhoodTestnet],
  transports: {
    [robinhoodMainnet.id]: http('https://rpc.mainnet.chain.robinhood.com'),
    [robinhoodTestnet.id]: http('https://rpc.testnet.chain.robinhood.com'),
  },
});
