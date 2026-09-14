import { ConnectButton } from '@rainbow-me/rainbowkit';

const LABEL = { disconnected: 'Not connected', 'wrong-network': 'Wrong network', connected: 'Connected' };

// Mounted into #wallet-connection-root, replacing the old static
// #walletConnectionBar. Reuses .connection-bar / .connected-badge /
// .text-link from css/trade.css.
export function ConnectionBar() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;
        const state = !mounted || !connected ? 'disconnected' : chain.unsupported ? 'wrong-network' : 'connected';
        const message = state === 'connected'
          ? 'Wallet connected to Arc Testnet. Deposit USDC into the Railflow vault (Manage collateral, below) to fund trading margin.'
          : state === 'wrong-network'
          ? 'Wallet connected. Switch to Arc Testnet to deposit real USDC as trading collateral.'
          : 'Connect your wallet to deposit real Arc Testnet USDC as trading collateral.';
        return (
          <div className="connection-bar" data-state={state}>
            <span className="connected-badge">{LABEL[state]}</span>
            <span role="status" aria-live="polite">{message}</span>
            {state !== 'connected' && (
              <button
                type="button"
                className="text-link"
                onClick={state === 'wrong-network' ? openChainModal : openConnectModal}
              >
                {state === 'wrong-network' ? 'Switch to Arc Testnet' : 'Connect wallet'}
              </button>
            )}
            {state === 'connected' && (
              <a
                className="text-link"
                href={'https://testnet.arcscan.app/address/' + account.address}
                target="_blank"
                rel="noopener noreferrer"
              >
                View wallet on explorer
              </a>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
