import { CIRCLE_BACKEND_URL } from './circleConfig.js';

async function request(path, { method = 'GET', userToken, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userToken) headers['x-user-token'] = userToken;
  const response = await fetch(CIRCLE_BACKEND_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Circle backend request failed (' + response.status + ').');
  return data;
}

export function fetchSession(userId) {
  return request('/api/circle/session', { method: 'POST', body: { userId } });
}

export async function fetchWallets(userToken) {
  const data = await request('/api/circle/wallets', { userToken });
  return data.wallets || [];
}

export function requestWalletCreation(userToken) {
  return request('/api/circle/wallets', { method: 'POST', userToken });
}

export function requestContractExecution({ userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, amount }) {
  return request('/api/circle/contract-execution', {
    method: 'POST',
    userToken,
    body: { walletId, contractAddress, abiFunctionSignature, abiParameters, amount },
  });
}
