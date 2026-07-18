import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './lib/wagmiConfig';
import { robinhoodMainnet, robinhoodTestnet } from './lib/chains';
import { Topbar } from './components/Topbar';
import { CalibrationBanner } from './components/CalibrationBanner';
import Home from './pages/Home';
import TokenDetail from './pages/TokenDetail';
import CliAuthPage from './pages/CliAuthPage';
import NotFound from './pages/not-found';

// Privy App ID — public identifier, safe in source.
const PRIVY_APP_ID = 'cmrgo8l9o00no0cjukk8954f0';

const queryClient = new QueryClient();

export default function App() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#C8FF16',
          logo: '/outrive-logo.png',
          landingHeader: 'Connect your wallet',
          showWalletLoginFirst: true,
        },
        loginMethods: ['wallet'],
        walletList: [
          'detected_wallets',   // injected wallets: MetaMask, Brave, Rabby, dll
          'metamask',
          'coinbase_wallet',
          'rainbow',
          'wallet_connect',
        ],
        defaultChain: robinhoodMainnet,
        supportedChains: [robinhoodMainnet, robinhoodTestnet],
        embeddedWallets: {
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'off' },
        },
        walletConnectCloudProjectId: 'cdcd2ad34c4983af22b864f7891ab2f4',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Topbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/token/:address" element={<TokenDetail />} />
              <Route path="/cli-auth" element={<CliAuthPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
