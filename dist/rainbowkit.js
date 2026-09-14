/* RainbowKit bridge for the homepage CTA. The site stays buildless, so the
   React wallet island is loaded from esm.sh alongside the existing SDK. */
import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import {
  ConnectButton,
  RainbowKitProvider,
} from 'https://esm.sh/@rainbow-me/rainbowkit@2.2.11?deps=@tanstack/react-query@5.59.16,react-dom@18.3.1,react@18.3.1,viem@2.21.55,wagmi@2.12.0';
import {
  WagmiProvider,
  createConfig,
  http,
  injected,
} from 'https://esm.sh/wagmi@2.12.0?deps=@tanstack/react-query@5.59.16,react-dom@18.3.1,react@18.3.1,viem@2.21.55';
import { QueryClient, QueryClientProvider } from 'https://esm.sh/@tanstack/react-query@5.59.16?deps=react@18.3.1';

const studionet = {
  id: 61999,
  name: 'GenLayer Studionet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://studio.genlayer.com/api'] } },
  blockExplorers: {
    default: { name: 'GenLayer Studio Explorer', url: 'https://explorer-studio.genlayer.com' },
  },
};

const wagmiConfig = createConfig({
  chains: [studionet],
  connectors: [injected()],
  transports: { [studionet.id]: http(studionet.rpcUrls.default.http[0]) },
});

const queryClient = new QueryClient();

function StartCheckButton() {
  return React.createElement(ConnectButton.Custom, {
    children: ({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
      const ready = mounted;
      const connected = ready && account && chain;
      const handleClick = () => {
        if (!connected) {
          if (openConnectModal) openConnectModal();
        } else if (chain.unsupported) {
          if (openChainModal) openChainModal();
        } else {
          window.location.href = '/submit/';
        }
      };
      return React.createElement(
        'button',
        {
          className: 'button',
          type: 'button',
          onClick: handleClick,
          'aria-label': connected ? 'Continue to claim submission' : 'Connect wallet to start a check',
          style: !ready ? { opacity: 0, pointerEvents: 'none' } : undefined,
        },
        'Start Check ',
        React.createElement('span', { className: 'arrow' }, '↗'),
      );
    },
  });
}

function WalletIsland() {
  return React.createElement(
    WagmiProvider,
    { config: wagmiConfig },
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        RainbowKitProvider,
        { initialChain: studionet, modalSize: 'compact' },
        React.createElement(StartCheckButton),
      ),
    ),
  );
}

const mount = document.getElementById('start-check-root');
if (mount) createRoot(mount).render(React.createElement(WalletIsland));
