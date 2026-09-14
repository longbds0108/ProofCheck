import { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useReadContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData, formatEther, parseEther } from 'viem';
import { arcTestnet } from './chain.js';
import { VAULT_ADDRESS } from './vault.js';
import { vaultAbi } from './vaultAbi.js';

function formatUsdc(value) {
  if (value === undefined || value === null) return '—';
  return Number(formatEther(value)).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function parsePositiveDecimal(value) {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return NaN;
  const number = Number(value);
  return number > 0 ? number : NaN;
}

function trimAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number(value.toFixed(6)).toString();
}

export function TradeCollateral() {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const { data: walletBalance, refetch: refetchWalletBalance } = useBalance({ address, query: { enabled: onArc && !!address } });
  const { data: collateral, refetch: refetchCollateral } = useReadContract({
    address: VAULT_ADDRESS || undefined,
    abi: vaultAbi,
    functionName: 'collateralOf',
    args: address ? [address] : undefined,
    query: { enabled: onArc && !!VAULT_ADDRESS && !!address },
  });
  const { sendTransactionAsync, data: hash, isPending } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({ hash });
  const walletUsdc = walletBalance ? Number(formatEther(walletBalance.value)) : 0;
  const busy = isPending || isConfirming;
  const maxDeposit = Math.max(0, walletUsdc - 0.01);
  const triggerRef = useRef(null);
  const closeButtonRef = useRef(null);

  function closeModal() {
    setIsOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!isSuccess) return;
    setAmount('');
    setError('');
    refetchWalletBalance();
    refetchCollateral();
    setIsOpen(false);
  }, [isSuccess]);

  useEffect(() => {
    if (isReceiptError) setError(receiptError?.shortMessage || receiptError?.message || 'Deposit transaction failed.');
  }, [isReceiptError, receiptError]);

  useEffect(() => {
    if (!isOpen) return undefined;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  async function handleDeposit(event) {
    event.preventDefault();
    setError('');
    const value = parsePositiveDecimal(amount);
    if (Number.isNaN(value)) return setError('Enter a valid amount greater than zero.');
    if (value > walletUsdc) return setError('Amount exceeds your wallet balance.');
    try {
      await sendTransactionAsync({
        to: VAULT_ADDRESS,
        data: encodeFunctionData({ abi: vaultAbi, functionName: 'deposit' }),
        value: parseEther(amount),
      });
    } catch (err) {
      setError(err.shortMessage || err.message || 'Transaction could not be submitted.');
    }
  }

  return (
    <div className="trade-deposit">
      <button ref={triggerRef} type="button" className="trade-deposit__trigger" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen}>
        <span>Deposit</span><small>USDC</small>
      </button>

      {isOpen && (
        <div className="trade-deposit__overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <section className="trade-deposit__modal" role="dialog" aria-modal="true" aria-labelledby="tradeDepositTitle">
            <div className="trade-deposit__heading">
              <div className="trade-deposit__title">
                <span className="trade-deposit__status-dot" aria-hidden="true" />
                <div>
                  <span className="trade-deposit__eyebrow">Collateral Vault</span>
                  <h2 id="tradeDepositTitle"><span className="trade-deposit__usdc-icon trade-deposit__usdc-icon--large usdc-image-crop" aria-hidden="true" />Deposit USDC</h2>
                </div>
              </div>
              <button ref={closeButtonRef} type="button" className="trade-deposit__close" onClick={closeModal} aria-label="Close deposit dialog">×</button>
            </div>
            <p className="trade-deposit__intro">Fund your trading margin with USDC on Arc Testnet.</p>

            {!isConnected ? (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => (
                  <button type="button" className="trade-deposit__connect" onClick={() => mounted && openConnectModal()}>
                    Connect wallet to deposit
                  </button>
                )}
              </ConnectButton.Custom>
            ) : !onArc ? (
              <ConnectButton.Custom>
                {({ openChainModal, mounted }) => (
                  <button type="button" className="trade-deposit__connect" onClick={() => mounted && openChainModal()}>
                    Switch to Arc Testnet
                  </button>
                )}
              </ConnectButton.Custom>
            ) : (
              <>
                <div className="trade-deposit__stats">
                  <div><span>Wallet balance</span><strong className="mono">{formatUsdc(walletBalance?.value)} <small>USDC</small></strong></div>
                  <div><span>Vault collateral</span><strong className="mono">{formatUsdc(collateral)} <small>USDC</small></strong></div>
                </div>
                <form className="trade-deposit__form" onSubmit={handleDeposit}>
                  <label className="trade-deposit__field">
                    <span>Amount</span>
                    <div className="trade-deposit__input-wrap">
                      <input className="trade-deposit__amount mono" type="text" inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} aria-label="USDC deposit amount" />
                      <span>USDC</span>
                    </div>
                  </label>
                  <button type="button" className="trade-deposit__max" disabled={busy || maxDeposit <= 0} onClick={() => setAmount(trimAmount(maxDeposit))}>Max</button>
                  <button type="submit" className="trade-deposit__submit" disabled={busy || !VAULT_ADDRESS}>
                    {busy ? 'Confirming…' : 'Deposit USDC'}
                  </button>
                </form>
                {error && <p className="trade-deposit__error" role="alert">{error}</p>}
                <p className="trade-deposit__note"><span aria-hidden="true">●</span> Transaction signed directly by your wallet</p>
              </>
            )}
            <a className="trade-deposit__vault-link" href="vault.html">View Vault dashboard ↗</a>
          </section>
        </div>
      )}
    </div>
  );
}
