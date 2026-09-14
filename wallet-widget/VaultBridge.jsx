import { useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { vaultAbi } from './vaultAbi.js';
import { VAULT_ADDRESS } from './vault.js';
import { arcTestnet } from './chain.js';

// Renders nothing — mounted unconditionally (every page, not behind a
// portal check) purely to keep window.RailflowVault in sync with the
// connected wallet's real on-chain collateral, so js/trade.js's trading
// margin ledger tracks it correctly even when the Vault page itself isn't
// open. VaultPage.jsx does the same read for its own display, but wagmi's
// query cache dedupes identical collateralOf(address) reads, so this
// doesn't double the network traffic.
export function VaultBridge() {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const { data: collateral } = useReadContract({
    address: VAULT_ADDRESS || undefined,
    abi: vaultAbi,
    functionName: 'collateralOf',
    args: address ? [address] : undefined,
    query: { enabled: onArc && !!VAULT_ADDRESS && !!address },
  });

  useEffect(() => {
    window.RailflowVault = {
      configured: !!VAULT_ADDRESS,
      ready: onArc && !!VAULT_ADDRESS && !!address,
      address: address ? address.toLowerCase() : null,
      chainId: chainId || null,
      collateral: collateral !== undefined ? Number(formatEther(collateral)) : 0,
    };
    window.dispatchEvent(new CustomEvent('railflow:vault-updated'));
  }, [collateral, onArc, address]);

  return null;
}
