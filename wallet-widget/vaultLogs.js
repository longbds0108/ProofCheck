import { VAULT_ADDRESS } from './vault.js';
import { vaultAbi } from './vaultAbi.js';

// Arc Testnet's RPC caps eth_getLogs to roughly a 29,000-block window and
// refuses fromBlock: 0 outright ("pruned history unavailable"), so a plain
// getContractEvents({ fromBlock: 0n }) always fails here (confirmed against
// the live RPC while building this page). This finds the vault's real
// deployment block once — binary search over getBytecode, since the
// contract has no code before it and code from it onward — and pages
// eth_getLogs forward from there in windows safely under the cap, instead
// of guessing a fixed lookback that could silently miss older history.
const CHUNK_BLOCKS = 20000n;
const STORAGE_KEY = 'railflow:vault-deploy-block:' + (VAULT_ADDRESS || '').toLowerCase();

let deploymentBlockPromise = null;

async function findDeploymentBlock(publicClient) {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return BigInt(cached);
  } catch { /* private browsing, etc. */ }

  const latest = await publicClient.getBlockNumber();
  let lo = 0n;
  let hi = latest;
  // A ~26-step binary search fired back-to-back is enough to trip Arc
  // Testnet's rate limit (observed 429s in testing, self-healed by viem's
  // retry but worth avoiding) — a small stagger between steps spreads the
  // requests out without meaningfully slowing the one-time search.
  while (lo < hi) {
    const mid = lo + (hi - lo) / 2n;
    const code = await publicClient.getBytecode({ address: VAULT_ADDRESS, blockNumber: mid });
    if (code && code !== '0x') hi = mid; else lo = mid + 1n;
    if (lo < hi) await new Promise((resolve) => setTimeout(resolve, 60));
  }
  try { localStorage.setItem(STORAGE_KEY, lo.toString()); } catch { /* ignore */ }
  return lo;
}

export async function getVaultLogs(publicClient, eventName, args) {
  if (!deploymentBlockPromise) deploymentBlockPromise = findDeploymentBlock(publicClient);
  const deployBlock = await deploymentBlockPromise;
  const latest = await publicClient.getBlockNumber();

  const chunks = [];
  for (let from = deployBlock; from <= latest; from += CHUNK_BLOCKS + 1n) {
    const to = from + CHUNK_BLOCKS < latest ? from + CHUNK_BLOCKS : latest;
    chunks.push([from, to]);
  }

  const results = await Promise.all(
    chunks.map(([from, to]) => publicClient.getContractEvents({ address: VAULT_ADDRESS, abi: vaultAbi, eventName, args, fromBlock: from, toBlock: to }))
  );
  return results.flat();
}
