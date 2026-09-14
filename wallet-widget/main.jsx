import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Providers } from './Providers.jsx';
import { HomeConnectButton } from './HomeConnectButton.jsx';
import { TradeWalletButton } from './TradeWalletButton.jsx';
import { VaultBridge } from './VaultBridge.jsx';
import { VaultPage } from './VaultPage.jsx';
import { TradeCollateral } from './TradeCollateral.jsx';
import { PortfolioBridge } from './PortfolioBridge.jsx';
import { LendingBridge } from './LendingBridge.jsx';

// One bundle serves all pages. Each page only has the mount points it
// needs, so most of these portals are no-ops on any given page. They all
// share a single Providers tree so wallet state stays in sync everywhere.
// VaultBridge has no mount point of its own — it renders nothing and just
// needs to be part of the tree (see VaultBridge.jsx) so js/trade.js's trading
// margin ledger stays synced with real vault collateral on every page,
// not only while vault.html itself is open.
function App() {
  const home = document.getElementById('wallet-home-root');
  const tradeButton = document.getElementById('wallet-trade-root');
  const vaultPage = document.getElementById('wallet-vault-root');
  const portfolioPage = document.getElementById('wallet-portfolio-root');
  const lendingPage = document.getElementById('wallet-lending-root');
  const tradeCollateral = document.getElementById('wallet-collateral-root');
  return (
    <Providers>
      <VaultBridge />
      {(portfolioPage || lendingPage) && <PortfolioBridge />}
      {lendingPage && <LendingBridge />}
      {home && createPortal(<HomeConnectButton />, home)}
      {tradeButton && createPortal(<TradeWalletButton />, tradeButton)}
      {vaultPage && createPortal(<VaultPage />, vaultPage)}
      {tradeCollateral && createPortal(<TradeCollateral />, tradeCollateral)}
    </Providers>
  );
}

const mount = document.createElement('div');
mount.id = 'wallet-widget-root';
document.body.appendChild(mount);
createRoot(mount).render(<App />);
