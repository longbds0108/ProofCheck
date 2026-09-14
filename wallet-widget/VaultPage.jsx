import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useBalance, usePublicClient, useReadContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData, formatEther, parseEther } from 'viem';
import { vaultAbi } from './vaultAbi.js';
import { VAULT_ADDRESS } from './vault.js';
import { arcTestnet } from './chain.js';
import { shortAddress } from './address.js';
import { getVaultLogs } from './vaultLogs.js';

function formatUsdc(value, digits = 4) {
  if (value === undefined || value === null) return '—';
  return Number(formatEther(value)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function formatNum(value, digits = 4) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function parsePositiveDecimal(value) {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return NaN;
  const number = Number(value);
  return number > 0 ? number : NaN;
}

// Strips floating-point noise from a quick-percent fill (e.g. 33.333333333336).
function trimAmount(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return Number(n.toFixed(6)).toString();
}

async function waitForChange(refetch, previousValue, attempts = 8, delayMs = 2500) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const result = await refetch();
    if (result?.data !== undefined && result.data !== previousValue) return;
  }
}

function formatDate(timestampSeconds) {
  return new Date(timestampSeconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const RANGE_SECONDS = { '1D': 86400, '1W': 7 * 86400, '1M': 30 * 86400, '1Y': 365 * 86400, ALL: Infinity };

const CHART_METRICS = [
  { id: 'cumulative-pnl', label: 'Cumulative PnL', empty: 'Strategy return data is not live yet.' },
  { id: 'daily-pnl', label: 'Daily PnL', empty: 'Daily return data is not live yet.' },
  { id: 'daily-apr', label: 'Daily APR %', empty: 'Daily APR data is not live yet.' },
  { id: 'vault-equity', label: 'TVL: Vault Equity' },
];

function RangeTabs({ options, value, onChange }) {
  return (
    <div className="vault-tabs" role="tablist">
      {options.map((option) => (
        <button key={option} type="button" role="tab" aria-selected={value === option} className={value === option ? 'is-active' : ''} onClick={() => onChange(option)}>{option}</button>
      ))}
    </div>
  );
}

function ChartMetricMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const selected = CHART_METRICS.find((metric) => metric.id === value) || CHART_METRICS[3];

  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="vault-chart-selector" ref={menuRef}>
      <button
        type="button"
        className="vault-chart-selector__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <span className="vault-chart-selector__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="vault-chart-selector__menu" role="listbox" aria-label="Vault chart metric">
          {CHART_METRICS.map((metric) => (
            <button
              key={metric.id}
              type="button"
              role="option"
              aria-selected={metric.id === value}
              className={metric.id === value ? 'is-active' : ''}
              onClick={() => { onChange(metric.id); setOpen(false); }}
            >
              <span>{metric.label}</span>
              {metric.id === value && <span className="vault-chart-selector__check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatChartValue(metric, value) {
  const formatted = Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return metric.id === 'daily-apr' ? formatted + '%' : formatted + ' USDC';
}

function formatChartDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function VaultStatsChart({ metric, points }) {
  const width = 760;
  const height = 240;
  const padding = { top: 16, right: 16, bottom: 30, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const hasData = points.length > 0;

  if (!hasData) {
    return (
      <div className="vault-stats-chart vault-stats-chart--empty" role="img" aria-label={metric.label + ' chart'}>
        <strong>{metric.label}</strong>
        <span>{metric.empty || 'No on-chain vault history is available for this range.'}</span>
      </div>
    );
  }

  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const spread = Math.max(Math.abs(max) * 0.12, 1);
    min -= spread;
    max += spread;
  }
  const range = max - min;
  const xFor = (index) => padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (value) => padding.top + ((max - value) / range) * plotHeight;
  const mapped = points.map((point, index) => ({ ...point, x: xFor(index), y: yFor(point.value) }));
  const linePath = mapped.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${mapped[mapped.length - 1].x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${mapped[0].x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;
  const yTicks = Array.from({ length: 5 }, (_, index) => max - (range * index) / 4);

  return (
    <div className="vault-stats-chart" role="img" aria-label={metric.label + ' chart'}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="vaultStatsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5ee3c4" stopOpacity=".24" />
            <stop offset="100%" stopColor="#5ee3c4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, index) => {
          const y = padding.top + (index / 4) * plotHeight;
          return (
            <g key={index}>
              <line className="vault-stats-chart__grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="vault-stats-chart__axis" x={padding.left - 10} y={y + 4} textAnchor="end">{formatChartValue(metric, tick)}</text>
            </g>
          );
        })}
        <path className="vault-stats-chart__area" d={areaPath} fill="url(#vaultStatsFill)" />
        <path className="vault-stats-chart__line" d={linePath} />
        {mapped.map((point) => (
          <circle key={`${point.timestamp}-${point.value}`} className="vault-stats-chart__point" cx={point.x} cy={point.y} r="3">
            <title>{formatChartDate(point.timestamp)} · {formatChartValue(metric, point.value)}</title>
          </circle>
        ))}
        <text className="vault-stats-chart__date" x={padding.left} y={height - 8}>{formatChartDate(points[0].timestamp)}</text>
        <text className="vault-stats-chart__date" x={width - padding.right} y={height - 8} textAnchor="end">{formatChartDate(points[points.length - 1].timestamp)}</text>
      </svg>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="vault-copy"
      aria-label="Copy address"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

// Reads every Deposited/Withdrawn log for the whole contract (no account
// filter) to build protocol-wide numbers — total value locked's history,
// how many distinct addresses have ever deposited, how old the vault is.
// These are real on-chain facts anyone can see, shown regardless of
// whether a wallet is connected, mirroring the always-visible market
// stats a real vault marketplace shows before you connect.
function useGlobalVaultStats(publicClient) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!publicClient || !VAULT_ADDRESS) { setLoading(false); return; }
    (async () => {
      try {
        const [deposits, withdrawals] = await Promise.all([
          getVaultLogs(publicClient, 'Deposited'),
          getVaultLogs(publicClient, 'Withdrawn'),
        ]);
        const blockTimes = new Map();
        async function timeOf(blockNumber) {
          if (!blockTimes.has(blockNumber)) {
            const block = await publicClient.getBlock({ blockNumber });
            blockTimes.set(blockNumber, Number(block.timestamp));
          }
          return blockTimes.get(blockNumber);
        }
        const rows = [];
        for (const log of deposits) rows.push({ type: 'Deposit', amount: log.args.amount, account: log.args.account, timestamp: await timeOf(log.blockNumber) });
        for (const log of withdrawals) rows.push({ type: 'Withdraw', amount: log.args.amount, account: log.args.account, timestamp: await timeOf(log.blockNumber) });
        rows.sort((a, b) => a.timestamp - b.timestamp);
        if (!cancelled) setEvents(rows);
      } catch (err) {
        console.error('[VaultPage] could not load protocol-wide vault history:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [publicClient]);

  const depositorCount = useMemo(() => new Set(events.filter((e) => e.type === 'Deposit').map((e) => e.account.toLowerCase())).size, [events]);
  const firstDeposit = useMemo(() => events.find((e) => e.type === 'Deposit')?.timestamp ?? null, [events]);

  return { events, loading, depositorCount, firstDeposit };
}

// Mounted into #wallet-vault-root on vault.html. The public hero/vault-card
// section (TVL, depositor count, protocol chart) reads straight from the
// chain and needs no connected wallet; the deposit/withdraw panel and the
// personal Transfers table use the connected external wallet directly.
// Strategy returns are described as a preview until the liquidation,
// money-market, and fee data layers are connected.
export function VaultPage() {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const publicClient = usePublicClient();

  const [mode, setMode] = useState('deposit');
  const [busyStep, setBusyStep] = useState('');
  const [error, setError] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [chartRange, setChartRange] = useState('ALL');
  const [chartMetric, setChartMetric] = useState('vault-equity');
  const [transferRange, setTransferRange] = useState('ALL');

  const panelRef = useRef(null);
  const amountInputRef = useRef(null);

  const { data: vaultTvl } = useBalance({ address: VAULT_ADDRESS || undefined, query: { enabled: !!VAULT_ADDRESS } });
  const globalStats = useGlobalVaultStats(publicClient);

  const { data: externalBalance, refetch: refetchExternalBalance } = useBalance({ address, query: { enabled: onArc && !!address } });
  const { data: collateral, refetch: refetchCollateral } = useReadContract({
    address: VAULT_ADDRESS || undefined,
    abi: vaultAbi,
    functionName: 'collateralOf',
    args: address ? [address] : undefined,
    query: { enabled: onArc && !!VAULT_ADDRESS && !!address },
  });

  const { sendTransaction, data: transactionHash, isPending: transactionSubmitting } = useSendTransaction();
  const { isLoading: transactionConfirming, isSuccess: transactionConfirmed } = useWaitForTransactionReceipt({ hash: transactionHash });
  useEffect(() => {
    if (!transactionConfirmed) return;
    refetchCollateral();
    refetchExternalBalance();
    loadEvents();
    setDepositAmount('');
    setWithdrawAmount('');
    setBusyStep('');
  }, [transactionConfirmed]);

  async function loadEvents() {
    if (!publicClient || !address || !VAULT_ADDRESS) { setEvents([]); return; }
    setLoadingEvents(true);
    try {
      const [deposits, withdrawals] = await Promise.all([
        getVaultLogs(publicClient, 'Deposited', { account: address }),
        getVaultLogs(publicClient, 'Withdrawn', { account: address }),
      ]);
      const blockTimes = new Map();
      async function timeOf(blockNumber) {
        if (!blockTimes.has(blockNumber)) {
          const block = await publicClient.getBlock({ blockNumber });
          blockTimes.set(blockNumber, Number(block.timestamp));
        }
        return blockTimes.get(blockNumber);
      }
      const rows = [];
      for (const log of deposits) rows.push({ type: 'Deposit', amount: log.args.amount, txHash: log.transactionHash, timestamp: await timeOf(log.blockNumber) });
      for (const log of withdrawals) rows.push({ type: 'Withdraw', amount: log.args.amount, txHash: log.transactionHash, timestamp: await timeOf(log.blockNumber) });
      rows.sort((a, b) => b.timestamp - a.timestamp);
      setEvents(rows);
    } catch (err) {
      console.error('[VaultPage] could not load transfer history:', err);
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => { loadEvents(); }, [address, publicClient]);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const transferEvents = useMemo(() => {
    const cutoff = nowSeconds - RANGE_SECONDS[transferRange];
    return events.filter((e) => e.timestamp >= cutoff);
  }, [events, transferRange]);

  const activeChartMetric = CHART_METRICS.find((metric) => metric.id === chartMetric) || CHART_METRICS[3];

  const chartPoints = useMemo(() => {
    if (chartMetric !== 'vault-equity') return [];
    const cutoff = nowSeconds - RANGE_SECONDS[chartRange];
    let running = 0;
    const points = [];
    let baseline;
    for (const event of globalStats.events) {
      running += (event.type === 'Deposit' ? 1 : -1) * Number(formatEther(event.amount));
      if (event.timestamp < cutoff) {
        baseline = { timestamp: cutoff, value: running };
        continue;
      }
      if (baseline && points.length === 0) points.push(baseline);
      points.push({ timestamp: event.timestamp, value: running });
    }
    // Always include the current on-chain vault balance so the Vault Equity
    // chart remains visible even when the selected range has no transfer
    // event inside it. This is a real contract balance, never an estimate.
    const currentEquity = vaultTvl ? Number(formatEther(vaultTvl.value)) : NaN;
    if (Number.isFinite(currentEquity)) {
      const lastPoint = points[points.length - 1];
      if (!lastPoint || lastPoint.timestamp !== nowSeconds) points.push({ timestamp: nowSeconds, value: currentEquity });
    }
    return points;
  }, [globalStats.events, chartRange, chartMetric, nowSeconds, vaultTvl]);

  if (!VAULT_ADDRESS) {
    return <p className="collateral-note">The Railflow vault contract hasn't been deployed on Arc Testnet yet.</p>;
  }

  const collateralUsdc = collateral !== undefined ? Number(formatEther(collateral)) : 0;
  const deposits = events.filter((e) => e.type === 'Deposit');
  const totalDeposited = deposits.reduce((sum, e) => sum + Number(formatEther(e.amount)), 0);
  const busy = busyStep !== '';
  const transactionBusy = transactionSubmitting || transactionConfirming;
  const tvlUsdc = vaultTvl ? Number(formatEther(vaultTvl.value)) : 0;
  const vaultAgeDays = globalStats.firstDeposit ? Math.max(0, Math.floor((nowSeconds - globalStats.firstDeposit) / 86400)) : null;
  const vaultShare = tvlUsdc > 0 ? (collateralUsdc / tvlUsdc) * 100 : 0;
  const hasPosition = !!address && collateralUsdc > 0;

  const externalBalanceUsdc = externalBalance ? Number(formatEther(externalBalance.value)) : 0;
  const maxForMode = mode === 'deposit' ? externalBalanceUsdc : collateralUsdc;
  const amountForMode = mode === 'deposit' ? depositAmount : withdrawAmount;
  const setAmountForMode = mode === 'deposit' ? setDepositAmount : setWithdrawAmount;

  function focusPanel(nextMode) {
    if (nextMode) setMode(nextMode);
    panelRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    amountInputRef.current?.focus();
  }

  async function sendVaultTransaction({ functionName, args = [], value, stepName }) {
    setError('');
    setBusyStep(stepName);
    try {
      await sendTransaction({
        to: VAULT_ADDRESS,
        data: encodeFunctionData({ abi: vaultAbi, functionName, args }),
        value,
      });
    } catch (err) {
      setError(err.shortMessage || err.message || 'Transaction could not be submitted.');
      setBusyStep('');
    }
  }

  function handleDeposit(event) {
    event.preventDefault();
    const value = parsePositiveDecimal(depositAmount);
    if (Number.isNaN(value)) return setError('Enter a valid deposit amount greater than zero.');
    if (value > externalBalanceUsdc) return setError('Amount exceeds your connected wallet balance.');
    sendVaultTransaction({ functionName: 'deposit', value: parseEther(depositAmount), stepName: 'deposit' });
  }

  function handleWithdraw(event) {
    event.preventDefault();
    const value = parsePositiveDecimal(withdrawAmount);
    if (Number.isNaN(value)) return setError('Enter a valid withdraw amount greater than zero.');
    if (value > collateralUsdc) return setError('Amount exceeds your deposited collateral.');
    const tradeState = window.RailflowTradeState;
    if (tradeState && value > tradeState.availableMargin) return setError('Amount exceeds your available (unused) margin — close positions or cancel orders first.');
    sendVaultTransaction({ functionName: 'withdraw', args: [parseEther(withdrawAmount)], stepName: 'withdraw' });
  }

  function handleModeSubmit(event) {
    return mode === 'deposit' ? handleDeposit(event) : handleWithdraw(event);
  }

  return (
    <div className="vault-page">
      <section className="vault-hero">
        <div className="vault-hero__copy">
          <div className="vault-hero__eyebrow"><span className="vault-live-dot"></span>Arc Testnet · Vault</div>
          <h1>One place to manage your Railflow Vault.</h1>
          <p>The RailFlow Vault seeks to generate returns through liquidation activity, lending within RailFlow’s native money market, and a share of trading fees. By depositing assets into the Vault, you acknowledge that your funds will be used in these activities and accept the associated risks. The value of your Vault holdings may increase or decrease over time. Returns are variable and not guaranteed, and you may lose some or all of your deposited assets. Please review RailFlow’s Risk Disclosure before depositing.</p>
        </div>
        <div className="vault-hero__pills">
          <div className="vault-pill"><span className="vault-pill__value mono">{formatNum(tvlUsdc, 2)}</span><span className="vault-pill__label">Total value locked</span></div>
          <div className="vault-pill"><span className="vault-pill__value mono">{globalStats.loading ? '…' : globalStats.depositorCount}</span><span className="vault-pill__label">Depositors</span></div>
          <div className="vault-pill"><span className="vault-pill__value mono">{vaultAgeDays !== null ? vaultAgeDays + 'd' : '—'}</span><span className="vault-pill__label">Vault age</span></div>
        </div>
      </section>

      <section className="vault-overview" aria-label="Vault overview">
        <div className="vault-overview__item vault-overview__item--primary">
          <span className="vault-overview__label">Vault Equity</span>
          <strong className="mono">{formatNum(tvlUsdc, 2)} USDC</strong>
          <small>On-chain balance</small>
        </div>
        <div className="vault-overview__item">
          <span className="vault-overview__label">Your position</span>
          <strong className="mono">{formatNum(collateralUsdc, 4)} USDC</strong>
          <small>{address ? 'Connected wallet position' : 'Connect to view position'}</small>
        </div>
        <div className="vault-overview__item">
          <span className="vault-overview__label">Vault share</span>
          <strong className="mono">{address ? formatNum(vaultShare, 3) + '%' : '—'}</strong>
          <small>Pro-rata UI calculation</small>
        </div>
        <div className="vault-overview__item">
          <span className="vault-overview__label">APR</span>
          <strong className="mono vault-value-muted">—</strong>
          <small>Return data not live</small>
        </div>
      </section>

      {hasPosition && (
        <section className="vault-position">
          <div className="vault-position__stats">
            <div><span className="vault-position__label">Your vault balance</span><span className="mono">{formatUsdc(collateral)} USDC</span></div>
            <div><span className="vault-position__label">Total deposited</span><span className="mono">{formatNum(totalDeposited)} USDC</span></div>
            <div><span className="vault-position__label">Vault share</span><span className="mono">{formatNum(vaultShare, 3)}%</span></div>
          </div>
          <div className="vault-position__actions">
            <button type="button" className="place-order" onClick={() => focusPanel('deposit')}>Deposit more</button>
            <button type="button" className="small-button" onClick={() => focusPanel('withdraw')}>Withdraw</button>
          </div>
        </section>
      )}

      <div className="vault-grid">
        <section className="vault-card">
          <div className="vault-card__head">
            <span className="vault-icon">RF</span>
            <div>
              <h2>Railflow Vault<span className="vault-badge">Arc Testnet</span><span className="vault-badge vault-badge--muted">Self-custodial</span></h2>
              <p className="mono vault-address">{shortAddress(VAULT_ADDRESS)}<CopyButton text={VAULT_ADDRESS} /><a className="text-link" href={'https://testnet.arcscan.app/address/' + VAULT_ADDRESS} target="_blank" rel="noopener noreferrer">View on Arcscan ↗</a></p>
            </div>
          </div>
          <div className="vault-card__notice"><span className="vault-card__notice-dot"></span><span>On-chain accounting active</span><span className="vault-card__notice-divider">·</span><span>Performance accounting pending</span></div>
          <p className="vault-desc">Deposit and withdraw your own testnet USDC through the Vault. Vault Equity is calculated from the contract balance and deposit/withdrawal history; PnL and APR appear only when live strategy data is available.</p>
          <div className="vault-metrics">
            <div><dt>TVL</dt><dd className="mono">{formatNum(tvlUsdc, 2)} USDC</dd></div>
            <div><dt>APR</dt><dd className="mono vault-value-muted">Not live</dd></div>
            <div><dt>Lock window</dt><dd className="mono">None</dd></div>
            <div><dt>Deposit fee</dt><dd className="mono">0.000%</dd></div>
          </div>
          <div className="vault-card__chart-head">
            <span>{activeChartMetric.label}</span>
            <div className="vault-chart-controls">
              <ChartMetricMenu value={chartMetric} onChange={setChartMetric} />
              <RangeTabs options={['1D', '1W', '1M', '1Y', 'ALL']} value={chartRange} onChange={setChartRange} />
            </div>
          </div>
          <div className="vault-chart-wrap">
            <VaultStatsChart metric={activeChartMetric} points={chartPoints} />
          </div>
          <div className="vault-perf__legend">
            <span className="vault-perf__dot"></span>
            {chartMetric === 'vault-equity' ? 'Vault equity from on-chain deposits and withdrawals' : 'Preview only — no return estimate is shown'}
          </div>
        </section>

        <aside className="vault-panel" ref={panelRef}>
          {!isConnected ? (
            <p className="collateral-note">Connect your wallet to deposit or withdraw directly from your own address.</p>
          ) : !onArc ? (
            <p className="collateral-note">Switch your wallet to Arc Testnet to manage your vault position.</p>
          ) : (
            <>
              <div className="vault-panel__title-row">
                <div><span className="vault-panel__eyebrow">Position</span><h2>Manage your vault</h2></div>
                <span className="vault-panel__network">ARC</span>
              </div>
              <div className="vault-flow-guide">
                <div className="vault-flow-guide__title">Deposit flow</div>
                <div className="vault-flow-guide__step"><span>1</span><p>Choose Deposit or Withdraw.</p></div>
                <div className="vault-flow-guide__step"><span>2</span><p>Enter an amount from your connected wallet balance.</p></div>
                <div className="vault-flow-guide__step"><span>3</span><p>Confirm the Arc Testnet transaction in your wallet.</p></div>
              </div>
              <div className="vault-panel__tabs">
                <button type="button" className={mode === 'deposit' ? 'is-active' : ''} onClick={() => setMode('deposit')}>Deposit</button>
                <button type="button" className={mode === 'withdraw' ? 'is-active' : ''} onClick={() => setMode('withdraw')}>Withdraw</button>
              </div>

              <form onSubmit={handleModeSubmit} className="collateral-form">
                <div className="vault-amount-head">
                  <label htmlFor="vaultAmount">Amount</label>
                  <span className="mono">Bal {formatNum(maxForMode)} USDC</span>
                </div>
                <div className="collateral-field">
                  <input ref={amountInputRef} id="vaultAmount" className="mono" type="text" inputMode="decimal" placeholder="0.00" value={amountForMode} disabled={busy || transactionBusy} onChange={(e) => setAmountForMode(e.target.value)} />
                </div>
                <div className="quick-pct">
                  {[25, 50, 75, 100].map((pct) => (
                    <button key={pct} type="button" disabled={busy || transactionBusy || maxForMode <= 0} onClick={() => setAmountForMode(trimAmount((maxForMode * pct) / 100))}>{pct === 100 ? 'Max' : pct + '%'}</button>
                  ))}
                </div>

                <dl className="vault-panel__info">
                  <div><dt>Your vault share</dt><dd className="mono">{formatNum(vaultShare, 3)}%</dd></div>
                  <div><dt>Lock window</dt><dd className="mono">None</dd></div>
                  <div><dt>Performance fee</dt><dd className="mono">None</dd></div>
                  <div><dt>Deposit fee</dt><dd className="mono">0.000%</dd></div>
                </dl>

                <button type="submit" className="place-order" disabled={busy || transactionBusy}>
                  {transactionBusy
                    ? (mode === 'deposit' ? 'Depositing…' : 'Withdrawing…')
                    : (amountForMode ? `${mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${amountForMode} USDC` : (mode === 'deposit' ? 'Deposit' : 'Withdraw'))}
                </button>
              </form>

              {error && <p className="collateral-error">{error}</p>}
            </>
          )}

        </aside>
      </div>

      {address && (
        <section className="vault-transfers">
          <div className="vault-main__head">
            <h2>Transfers</h2>
            <RangeTabs options={['1D', '1W', '1M', '1Y', 'ALL']} value={transferRange} onChange={setTransferRange} />
          </div>
          {loadingEvents ? (
            <p className="collateral-note">Loading transfer history…</p>
          ) : transferEvents.length === 0 ? (
            <p className="collateral-note">You have no deposits to the vault.</p>
          ) : (
            <table className="vault-table">
              <thead><tr><th>Action</th><th>Status</th><th>Amount</th><th>Updated at</th><th>Transaction details</th></tr></thead>
              <tbody>
                {transferEvents.map((event) => (
                  <tr key={event.txHash + event.type}>
                    <td>{event.type}</td>
                    <td>Confirmed</td>
                    <td className="mono">{formatUsdc(event.amount)} USD</td>
                    <td className="mono">{formatDate(event.timestamp)}</td>
                    <td><a href={'https://testnet.arcscan.app/tx/' + event.txHash} target="_blank" rel="noopener noreferrer">View ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
