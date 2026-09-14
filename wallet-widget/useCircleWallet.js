import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';
import { arcTestnet } from './chain.js';
import { CIRCLE_APP_ID, circleUserIdFor } from './circleConfig.js';
import { fetchSession, fetchWallets, requestWalletCreation } from './circleApi.js';

function storageKeyFor(address) {
  return 'railflow:circle-wallet:' + address.toLowerCase();
}

function log(...args) {
  console.log('[useCircleWallet]', ...args);
}

// Circle's own integration notes warn that sdk.execute() "silently fails"
// if getDeviceId() hasn't resolved first — which means a genuine failure
// here (network, ad-blocker, third-party-cookie blocking on the iframe
// Circle's SDK opens) can otherwise hang forever with no visible error,
// looking indistinguishable from "nothing happened". A timeout turns that
// into a concrete, reportable error instead.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Shared by VaultBridge (invisible, always mounted on every page, just
// needs to know the collateral-owning address if one already exists — it
// must never trigger wallet creation itself, or every page would pop
// Circle's PIN screen) and VaultPage (the full dashboard, which starts
// creation from an explicit button). The PIN step itself still needs the
// user — that's Circle's hosted UI and can't be skipped.
export function useCircleWallet({ autoCreate = false } = {}) {
  const { address, isConnected, chainId } = useAccount();
  const onArc = isConnected && chainId === arcTestnet.id;
  const [session, setSession] = useState(null);
  const [circleWallet, setCircleWallet] = useState(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('idle');
  const [autoError, setAutoError] = useState('');
  const sdkRef = useRef(null);
  const autoStartedRef = useRef(false);

  function ensureSdk() {
    if (!CIRCLE_APP_ID) return null;
    if (!sdkRef.current) sdkRef.current = new W3SSdk({ appSettings: { appId: CIRCLE_APP_ID } });
    return sdkRef.current;
  }

  // Runs the PIN-with-wallet-creation challenge and, on success, caches and
  // returns the new wallet. Shared by the autoCreate effect below and the
  // manual setUpWallet() retry path.
  async function createWalletFlow(data) {
    log('requesting wallet-creation challenge…');
    const { challengeId } = await requestWalletCreation(data.userToken);
    log('challenge received, opening Circle PIN UI', { challengeId });
    setStatus('awaiting-pin');
    return new Promise((resolve, reject) => {
      const sdk = ensureSdk();
      try {
        sdk.execute(challengeId, async (err, result) => {
          log('PIN challenge callback fired', { err: err && err.message, result });
          if (err || !result || result.status !== 'COMPLETE') {
            reject(new Error((err && err.message) || 'Wallet setup was not completed.'));
            return;
          }
          try {
            const wallets = await fetchWallets(data.userToken);
            if (wallets.length === 0) throw new Error('Wallet setup completed but no wallet was returned.');
            const wallet = { id: wallets[0].id, address: wallets[0].address };
            localStorage.setItem(storageKeyFor(address), JSON.stringify(wallet));
            setCircleWallet(wallet);
            setStatus('ready');
            resolve(wallet);
          } catch (e) {
            reject(e);
          }
        });
      } catch (syncErr) {
        // sdk.execute() throwing synchronously (rather than via the
        // callback) usually means the iframe/session isn't ready.
        log('sdk.execute threw synchronously', syncErr);
        reject(syncErr);
      }
    });
  }

  // Silently restore a cached wallet, then (if none cached) check once in
  // the background whether Circle already has a wallet for this address —
  // a plain lookup needs no PIN. If still none and autoCreate is set,
  // immediately start creating one (surfacing Circle's PIN screen) instead
  // of waiting for a button click.
  useEffect(() => {
    if (!onArc || !address || !CIRCLE_APP_ID) {
      log('skipping — not ready', { onArc, hasAddress: !!address, hasAppId: !!CIRCLE_APP_ID });
      autoStartedRef.current = null;
      setSession(null);
      setCircleWallet(null);
      setAutoError('');
      setStatus('idle');
      return;
    }
    // Keyed by address rather than a plain boolean: wagmi can fire this
    // effect more than once in quick succession while connecting (e.g.
    // isConnected flipping true a tick before address settles), and
    // without this guard each firing independently starts its own
    // fetchSession → getDeviceId → createWalletFlow chain — in the worst
    // case opening two concurrent Circle PIN challenges. A firing for the
    // same address that's already in flight (or done) is a no-op; a
    // genuinely different address (switching wallets) still starts fresh.
    if (autoStartedRef.current === address) return;
    autoStartedRef.current = address;
    setSession(null);
    setCircleWallet(null);
    setAutoError('');
    setStatus('idle');
    let cancelled = false;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKeyFor(address)) || 'null');
      if (cached) { log('restored cached wallet', cached); setCircleWallet(cached); setStatus('ready'); return; }
    } catch { /* ignore malformed cache */ }
    setChecking(true);
    (async () => {
      try {
        setStatus('session');
        log('fetching Circle session for', circleUserIdFor(address));
        const data = await withTimeout(fetchSession(circleUserIdFor(address)), 15000, 'Timed out reaching the Circle backend (backend/server.mjs). Is it running (npm run server)?');
        if (cancelled) return;
        log('got session, userId=', data.userId);
        setSession(data);
        setStatus('device');
        const sdk = ensureSdk();
        log('calling sdk.getDeviceId()…');
        await withTimeout(sdk.getDeviceId(), 15000, 'Timed out establishing a session with Circle (getDeviceId). This usually means the hidden iframe Circle\'s SDK opens couldn\'t load — check for an ad-blocker/privacy extension blocking app.circle.com, or third-party cookies being blocked.');
        log('got device id');
        sdk.setAuthentication({ userToken: data.userToken, encryptionKey: data.encryptionKey });
        setStatus('wallets');
        log('listing existing wallets…');
        const wallets = await fetchWallets(data.userToken);
        if (cancelled) return;
        log('wallets found:', wallets.length);
        if (wallets.length > 0) {
          const wallet = { id: wallets[0].id, address: wallets[0].address };
          localStorage.setItem(storageKeyFor(address), JSON.stringify(wallet));
          setCircleWallet(wallet);
          setStatus('ready');
          return;
        }
        if (autoCreate) {
          setStatus('creating');
          await createWalletFlow(data);
        } else {
          setStatus('idle');
        }
      } catch (err) {
        log('failed:', err.message, err);
        setStatus('error');
        if (!cancelled) setAutoError(err.message || 'Could not connect to the Circle backend.');
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onArc, address, autoCreate]);

  async function ensureSession() {
    if (session) return session;
    if (!address) throw new Error('Connect your wallet first.');
    const data = await fetchSession(circleUserIdFor(address));
    setSession(data);
    const sdk = ensureSdk();
    if (!sdk) throw new Error('Circle Wallets is not configured (missing App ID).');
    await withTimeout(sdk.getDeviceId(), 15000, 'Timed out establishing a session with Circle (getDeviceId).');
    sdk.setAuthentication({ userToken: data.userToken, encryptionKey: data.encryptionKey });
    return data;
  }

  async function setUpWallet() {
    setAutoError('');
    const data = await ensureSession();
    const existing = await fetchWallets(data.userToken);
    if (existing.length > 0) {
      const wallet = { id: existing[0].id, address: existing[0].address };
      localStorage.setItem(storageKeyFor(address), JSON.stringify(wallet));
      setCircleWallet(wallet);
      setStatus('ready');
      return wallet;
    }
    setStatus('creating');
    return createWalletFlow(data);
  }

  return { address, isConnected, onArc, circleWallet, checking, status, autoError, ensureSdk, ensureSession, setUpWallet };
}
