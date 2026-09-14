/* RainbowKit bridge for the homepage CTA. The site stays buildless, so the
   React wallet island is loaded from esm.sh alongside the existing SDK. */
import React, { useEffect, useRef } from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import {
  RainbowKitProvider,
  useChainModal,
  useConnectModal,
} from 'https://esm.sh/@rainbow-me/rainbowkit@2.2.11?deps=react@18.3.1,react-dom@18.3.1,wagmi@2.12.0,viem@2.21.55,@tanstack/react-query@5.59.16';
import {
  WagmiProvider,
  createConfig,
  http,
  injected,
  useAccount,
} from 'https://esm.sh/wagmi@2.12.0?deps=react@18.3.1,react-dom@18.3.1,viem@2.21.55,@tanstack/react-query@5.59.16';
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

function StartCheckBridge() {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const pendingStart = useRef(false);

  useEffect(() => {
    const button = document.querySelector('[data-start-check]');
    if (!button) return undefined;

    const startCheck = () => {
      pendingStart.current = true;
      if (isConnected && chainId !== studionet.id) {
        if (openChainModal) openChainModal();
        return;
      }
      if (isConnected && address) {
        window.location.href = '/submit/';
        return;
      }
      if (openConnectModal) openConnectModal();
    };

    button.addEventListener('click', startCheck);
    return () => button.removeEventListener('click', startCheck);
  }, [address, chainId, isConnected, openChainModal, openConnectModal]);

  useEffect(() => {
    if (!pendingStart.current || !isConnected || !address) return;
    if (chainId !== studionet.id) {
      if (openChainModal) openChainModal();
      return;
    }
    pendingStart.current = false;
    window.location.href = '/submit/';
  }, [address, chainId, isConnected, openChainModal]);

  return null;
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
        React.createElement(StartCheckBridge),
      ),
    ),
  );
}

const mount = document.getElementById('rainbowkit-root');
if (mount) createRoot(mount).render(React.createElement(WalletIsland));
