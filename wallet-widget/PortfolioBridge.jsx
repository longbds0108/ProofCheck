import { useEffect } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { arcTestnet } from './chain.js';

// Keeps the static portfolio surface in sync with the shared RainbowKit/Wagmi
// account. Transaction history itself is fetched by js/portfolio.js from the
// Arcscan Testnet address endpoint, while this bridge supplies the exact live
// connected address, chain state, and native USDC balance.
export function PortfolioBridge() {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const { data: balance } = useBalance({
    address,
    query: { enabled: onArc, refetchInterval: 10000 },
  });

  useEffect(() => {
    const detail = {
      address: address || null,
      isConnected,
      onArc,
      balance: onArc && balance ? formatUnits(balance.value, balance.decimals) : null,
    };
    window.RailflowPortfolio = detail;
    window.dispatchEvent(new CustomEvent('railflow:portfolio-account', { detail }));
  }, [address, isConnected, onArc, balance]);

  return null;
}
