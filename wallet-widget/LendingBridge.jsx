import { useEffect } from 'react';
import { useAccount, useReadContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { useChainModal, useConnectModal } from '@rainbow-me/rainbowkit';
import { encodeFunctionData, formatEther, parseEther } from 'viem';
import { arcTestnet } from './chain.js';
import { LENDING_MARKET_ADDRESS } from './lendingMarket.js';
import { lendingMarketAbi } from './lendingMarketAbi.js';

function valueAt(values, index) {
  return values && values[index] !== undefined ? formatEther(values[index]) : null;
}

export function LendingBridge() {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const enabled = onArc && !!address && !!LENDING_MARKET_ADDRESS;
  const { openConnectModal } = useConnectModal();
  const { openChainModal } = useChainModal();
  const { data: market, refetch: refetchMarket } = useReadContract({
    address: LENDING_MARKET_ADDRESS,
    abi: lendingMarketAbi,
    functionName: 'marketData',
    query: { enabled, refetchInterval: 10000 },
  });
  const { data: position, refetch: refetchPosition } = useReadContract({
    address: LENDING_MARKET_ADDRESS,
    abi: lendingMarketAbi,
    functionName: 'userPosition',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 10000 },
  });
  const { sendTransaction, data: transactionHash, isPending: isSending, error: sendError } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: receiptError } = useWaitForTransactionReceipt({ hash: transactionHash });

  useEffect(() => {
    const handler = () => {
      if (!isConnected) return openConnectModal?.();
      if (!onArc) return openChainModal?.();
    };
    window.addEventListener('railflow:lending-connect', handler);
    return () => window.removeEventListener('railflow:lending-connect', handler);
  }, [isConnected, onArc, openConnectModal, openChainModal]);

  useEffect(() => {
    const handler = (event) => {
      const { action, amount } = event.detail || {};
      if (!enabled || !amount || !/^\d+(\.\d+)?$/.test(amount)) return;
      const value = parseEther(amount);
      const functionName = action === 'borrow' ? 'borrow' : 'supply';
      sendTransaction({
        to: LENDING_MARKET_ADDRESS,
        data: encodeFunctionData({ abi: lendingMarketAbi, functionName, args: action === 'borrow' ? [value] : [] }),
        ...(action === 'supply' ? { value } : {}),
      });
    };
    window.addEventListener('railflow:lending-submit', handler);
    return () => window.removeEventListener('railflow:lending-submit', handler);
  }, [enabled, sendTransaction]);

  useEffect(() => {
    if (isConfirmed) {
      refetchMarket();
      refetchPosition();
    }
  }, [isConfirmed, refetchMarket, refetchPosition]);

  useEffect(() => {
    const error = sendError || receiptError;
    window.dispatchEvent(new CustomEvent('railflow:lending-state', {
      detail: {
        configured: !!LENDING_MARKET_ADDRESS,
        enabled,
        onArc,
        isBusy: isSending || isConfirming,
        isConfirmed,
        transactionHash: transactionHash || null,
        error: error ? (error.shortMessage || error.message || 'Transaction failed') : null,
        market: market ? {
          totalSupplied: valueAt(market, 0),
          totalBorrowed: valueAt(market, 1),
          liquidity: valueAt(market, 2),
          utilizationBps: market[3]?.toString(),
          supplyApyBps: market[4]?.toString(),
          borrowApyBps: market[5]?.toString(),
        } : null,
        position: position ? {
          supplied: valueAt(position, 0),
          borrowed: valueAt(position, 1),
          borrowCapacity: valueAt(position, 2),
        } : null,
      },
    }));
  }, [enabled, onArc, isSending, isConfirming, isConfirmed, transactionHash, sendError, receiptError, market, position]);

  return null;
}
