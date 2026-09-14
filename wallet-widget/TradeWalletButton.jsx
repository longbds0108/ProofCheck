import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useBalance } from 'wagmi';

function BalanceChip({ address }) {
  const { data, isLoading } = useBalance({ address });
  const text = isLoading
    ? '—'
    : data
    ? Number(data.formatted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  return (
    <span className="wallet-equity">
      <span className="wallet-equity__label">Portfolio</span>
      <strong className="mono wallet-balance-value">${text}</strong>
    </span>
  );
}

// Mounted into #wallet-trade-root (inside the .wallet-wrap container in
// trade.html's header). Reuses the .wallet-button / .wallet-equity /
// .wallet-avatar / .chevron classes already defined in css/trade.css.
// Clicking a connected wallet opens RainbowKit's own account modal
// (balance, copy address, explorer link, disconnect, network switch)
// instead of a hand-rolled dropdown.
export function TradeWalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, openAccountModal, mounted }) => {
        const connected = mounted && account && chain;
        const state = !mounted || !connected ? 'disconnected' : chain.unsupported ? 'wrong-network' : 'connected';
        return (
          <button
            type="button"
            className="wallet-button"
            data-state={state}
            aria-haspopup="dialog"
            onClick={() => {
              if (!mounted) return;
              if (!connected) return openConnectModal();
              if (chain.unsupported) return openChainModal();
              openAccountModal();
            }}
          >
            {state === 'connected' && <BalanceChip address={account.address} />}
            {state !== 'connected' && <span className="mono wallet-address">{state === 'disconnected' ? 'Connect wallet' : 'Wrong network'}</span>}
            {state !== 'connected' && <span className="chevron" aria-hidden="true">▾</span>}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
