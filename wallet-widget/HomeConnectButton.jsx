import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { shortAddress } from './address.js';
import { arcTestnet } from './chain.js';

// Mounted into #wallet-home-root. Reuses the existing .btn / .btn--primary
// classes from css/styles.css, so it needs no styling of its own.
export function HomeConnectButton() {
  // useAccount/useEffect must live in this component's own render, not
  // inside the ConnectButton.Custom render-prop below — that callback runs
  // as part of RainbowKit's own internal component, so hooks called there
  // would attach to the wrong fiber. "unsupported" is derived from wagmi's
  // own chainId rather than the render-prop's chain.unsupported for the
  // same reason: this effect can't depend on a value computed inside that
  // other render.
  const { isConnected, chainId } = useAccount();
  const unsupported = isConnected && chainId !== arcTestnet.id;
  // Only a connection started by clicking this button should navigate the
  // visitor away — not a wallet wagmi silently restores on page load.
  const awaitingConnect = useRef(false);

  useEffect(() => {
    if (awaitingConnect.current && isConnected && !unsupported) {
      awaitingConnect.current = false;
      window.location.assign('trade.html');
    }
  }, [isConnected, unsupported]);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;
        const label = !mounted || !connected
          ? 'Connect wallet'
          : chain.unsupported
          ? 'Wrong network'
          : shortAddress(account.address);
        return (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              if (!mounted) return;
              if (!connected) { awaitingConnect.current = true; openConnectModal(); return; }
              if (chain.unsupported) { openChainModal(); return; }
              window.location.assign('trade.html');
            }}
          >
            {label}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
