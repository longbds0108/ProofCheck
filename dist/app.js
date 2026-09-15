/* ProofCheck browser client. Wallet connection uses the injected EIP-1193
   provider exposed by MetaMask, Coinbase Wallet, OKX, or another EVM wallet. */

(function () {
  'use strict';

  var config = window.PROOFCHECK_CONFIG || {};
  var state = {
    provider: null,
    account: '',
    chainId: null,
    listenersAttached: false,
    sdk: null,
    chains: null,
    client: null,
  };
  var announcedProviders = [];

  function rememberAnnouncedProvider(event) {
    var detail = event && event.detail;
    if (!detail || !detail.provider) return;
    var known = announcedProviders.some(function (item) { return item.provider === detail.provider; });
    if (!known) announcedProviders.push({ provider: detail.provider, info: detail.info || {} });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('eip6963:announceProvider', rememberAnnouncedProvider);
  }

  var $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };

  var $$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  var shortAddress = function (address) {
    return address ? address.slice(0, 6) + '…' + address.slice(-4) : 'Connect wallet';
  };

  var targetChainId = function () {
    return Number(config.chainId || 61997);
  };

  var targetChainHex = function () {
    return '0x' + targetChainId().toString(16);
  };

  var targetNetworkName = function () {
    return config.networkName || (config.network === 'studioDevnet' || config.network === 'studio-next' ? 'GenLayer Studio Next' : 'GenLayer');
  };

  function providerList() {
    var injected = !window.ethereum
      ? []
      : window.ethereum.providers && window.ethereum.providers.length
      ? window.ethereum.providers
      : [window.ethereum];
    return announcedProviders.map(function (item) { return item.provider; }).concat(injected)
      .filter(function (provider, index, providers) { return provider && providers.indexOf(provider) === index; });
  }

  function providerMetadata(provider) {
    var announced = announcedProviders.find(function (item) { return item.provider === provider; });
    return announced ? announced.info : {};
  }

  function isOkxProvider(provider) {
    var info = providerMetadata(provider);
    return Boolean(provider && (
      provider.isOkxWallet
      || provider.isOKXWallet
      || provider.isOKExWallet
      || (window.okxwallet && provider === window.okxwallet)
      || /okx|okex/i.test(String(info.rdns || '') + ' ' + String(info.name || ''))
    ));
  }

  function matchesWalletType(provider, walletType) {
    if (walletType === 'metamask') {
      var info = providerMetadata(provider);
      var isAnnouncedMetaMask = info.rdns === 'io.metamask' || /^MetaMask$/i.test(String(info.name || ''));
      return (isAnnouncedMetaMask || provider.isMetaMask)
        && !provider.isCoinbaseWallet
        && !isOkxProvider(provider);
    }
    if (walletType === 'coinbase') return provider.isCoinbaseWallet === true;
    return true;
  }

  function getProvider(walletType) {
    var providers = providerList();
    if (!providers.length) return null;
    return providers.find(function (provider) { return matchesWalletType(provider, walletType); }) || null;
  }

  async function findProvider(walletType) {
    var providers = providerList().filter(function (provider) { return matchesWalletType(provider, walletType); });
    return providers[0] || null;
  }

  function setStatus(text, kind) {
    var status = $('#wallet-status');
    if (!status) return;
    status.textContent = text;
    status.dataset.state = kind || 'info';
  }

  function ensureWalletButton() {
    var existing = $('[data-wallet-connect]');
    if (existing) return existing;

    var nav = $('.site-header .nav-links');
    if (!nav) return null;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button wallet-button';
    button.dataset.walletConnect = '';
    button.textContent = 'Connect wallet';
    nav.appendChild(button);
    return button;
  }

  function ensureModal() {
    var existing = $('#wallet-modal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.className = 'wallet-modal';
    modal.id = 'wallet-modal';
    modal.innerHTML = [
      '<div class="wallet-modal-content">',
      '  <div class="wallet-modal-header">',
      '    <h2 id="wallet-modal-title">Connect wallet</h2>',
      '    <p id="wallet-modal-subtitle">Connect an EVM wallet to continue on GenLayer.</p>',
      '  </div>',
      '  <button class="wallet-modal-close" id="wallet-modal-close" type="button" aria-label="Close">×</button>',
      '  <div class="wallet-modal-body">',
      '    <div id="wallet-status" class="wallet-status" data-state="info" role="status" aria-live="polite"></div>',
      '    <div data-wallet-options>',
      '      <div class="wallet-category">',
      '        <div class="wallet-category-label">Browser wallets</div>',
      '        <div class="wallet-options">',
      '          <button class="wallet-option" data-wallet="metamask" type="button"><div class="wallet-option-icon">🦊</div><div class="wallet-option-info"><h3>MetaMask</h3><p>Connect an injected wallet</p></div></button>',
      '          <button class="wallet-option" data-wallet="coinbase" type="button"><div class="wallet-option-icon">🔵</div><div class="wallet-option-info"><h3>Coinbase Wallet</h3><p>Connect an injected wallet</p></div></button>',
      '          <button class="wallet-option" data-wallet="other" type="button"><div class="wallet-option-icon">👛</div><div class="wallet-option-info"><h3>Other EVM wallet</h3><p>Use the wallet detected in your browser</p></div></button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div class="wallet-actions">',
      '      <button class="button wallet-switch-button" id="wallet-switch-network" type="button" hidden>Switch to ' + targetNetworkName() + '</button>',
      '      <button class="button ghost wallet-disconnect-button" id="wallet-disconnect" type="button" hidden>Disconnect</button>',
      '    </div>',
      '  </div>',
      '  <div class="wallet-modal-footer"><p>New to Web3? <a href="https://metamask.io/" target="_blank" rel="noreferrer">Get a wallet</a></p></div>',
      '</div>',
    ].join('');
    document.body.appendChild(modal);
    return modal;
  }

  function showModal() {
    var modal = ensureModal();
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    renderWalletState();
  }

  function hideModal() {
    var modal = $('#wallet-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderWalletState() {
    var connected = Boolean(state.account);
    var correctNetwork = state.chainId === targetChainId();
    var buttons = $$('[data-wallet-connect]');
    buttons.forEach(function (button) {
      button.classList.toggle('is-connected', connected && correctNetwork);
      button.textContent = connected && correctNetwork
        ? shortAddress(state.account)
        : connected
        ? 'Switch network'
        : 'Connect wallet';
    });

    var title = $('#wallet-modal-title');
    var subtitle = $('#wallet-modal-subtitle');
    var options = $('[data-wallet-options]');
    var switchButton = $('#wallet-switch-network');
    var disconnectButton = $('#wallet-disconnect');

    if (title) title.textContent = connected ? 'Wallet connected' : 'Connect wallet';
    if (subtitle) subtitle.textContent = connected
      ? shortAddress(state.account) + ' · ' + (correctNetwork ? targetNetworkName() : 'Wrong network')
      : 'Connect an EVM wallet to continue on GenLayer.';
    if (options) options.hidden = connected;
    if (switchButton) switchButton.hidden = !connected || correctNetwork;
    if (disconnectButton) disconnectButton.hidden = !connected;

    if (!connected) {
      if (!window.ethereum) setStatus('No browser wallet detected. Install MetaMask or another EVM wallet.', 'error');
      else setStatus('Choose a browser wallet to connect.', 'info');
    } else if (!correctNetwork) {
      setStatus('Connected, but this wallet is on chain ' + state.chainId + '. Switch to ' + targetNetworkName() + ' (chain ' + targetChainId() + ').', 'warning');
    } else {
      setStatus('Connected and ready on ' + targetNetworkName() + '.', 'success');
    }
  }

  async function readChainId(provider) {
    var chainId = await provider.request({ method: 'eth_chainId' });
    return typeof chainId === 'string' ? parseInt(chainId, 16) : Number(chainId);
  }

  function attachProviderListeners(provider) {
    if (state.listenersAttached || !provider || typeof provider.on !== 'function') return;
    state.listenersAttached = true;
    provider.on('accountsChanged', function (accounts) {
      state.account = accounts && accounts[0] ? accounts[0] : '';
      if (!state.account) state.chainId = null;
      renderWalletState();
    });
    provider.on('chainChanged', function (chainId) {
      state.chainId = typeof chainId === 'string' ? parseInt(chainId, 16) : Number(chainId);
      renderWalletState();
    });
  }

  async function connectWallet(walletType) {
    var provider = await findProvider(walletType);
    if (!provider) {
      setStatus(walletType === 'coinbase'
        ? 'Coinbase Wallet was not detected. Use another browser wallet or install Coinbase Wallet.'
        : 'No browser wallet detected. Install MetaMask or another EVM wallet.', 'error');
      return false;
    }

    try {
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) throw new Error('No account was selected.');
      state.provider = provider;
      state.account = accounts[0];
      state.chainId = await readChainId(provider);
      state.listenersAttached = false;
      attachProviderListeners(provider);
      renderWalletState();
      if (state.chainId !== targetChainId()) return false;
      hideModal();
      window.dispatchEvent(new CustomEvent('proofcheck:wallet-connected', { detail: getWalletState() }));
      return true;
    } catch (error) {
      if (error && error.code === 4001) setStatus(walletType === 'metamask'
        ? 'MetaMask connection was rejected. Unlock MetaMask and approve this site.'
        : 'Wallet connection was rejected. Approve the request in your wallet.', 'error');
      else setStatus(error && error.message ? error.message : 'Wallet connection failed.', 'error');
      return false;
    }
  }

  async function switchNetwork() {
    if (!state.provider) return false;
    var chainId = targetChainHex();
    try {
      await state.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainId }] });
    } catch (error) {
      if (error && error.code === 4902) {
        await state.provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainId,
            chainName: targetNetworkName(),
            nativeCurrency: {
              name: config.nativeCurrencyName || 'GEN',
              symbol: config.nativeCurrencySymbol || 'GEN',
              decimals: Number(config.nativeCurrencyDecimals || 18),
            },
            rpcUrls: [config.rpcUrl].filter(Boolean),
            blockExplorerUrls: [config.contractExplorer].filter(Boolean),
          }],
        });
      } else if (error && error.code === 4001) {
        setStatus('Network switch was rejected in the wallet.', 'error');
        return false;
      } else {
        setStatus(error && error.message ? error.message : 'Unable to switch network.', 'error');
        return false;
      }
    }
    state.chainId = await readChainId(state.provider);
    renderWalletState();
    if (state.chainId === targetChainId()) {
      hideModal();
      window.dispatchEvent(new CustomEvent('proofcheck:wallet-connected', { detail: getWalletState() }));
      return true;
    }
    return false;
  }

  function disconnectWallet() {
    state.provider = null;
    state.account = '';
    state.chainId = null;
    state.listenersAttached = false;
    renderWalletState();
    setStatus('Wallet disconnected from this dApp. The wallet permission remains available in your wallet.', 'info');
  }

  function getWalletState() {
    return {
      account: state.account,
      chainId: state.chainId,
      isConnected: Boolean(state.account),
      isCorrectNetwork: state.chainId === targetChainId(),
      isPreferredAccount: true,
      provider: state.provider,
    };
  }

  function setFormMessage(form, text, isError) {
    var message = $('[data-form-message]', form);
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('is-error', Boolean(isError));
  }

  var LIVE_CLAIM_STORAGE_KEY = 'proofcheck:finalized-claims';

  function saveLiveClaim(record) {
    try {
      var existing = JSON.parse(window.localStorage.getItem(LIVE_CLAIM_STORAGE_KEY) || '[]');
      if (!Array.isArray(existing)) existing = [];
      existing = existing.filter(function (item) { return item && item.tx_id !== record.tx_id; });
      existing.unshift(record);
      window.localStorage.setItem(LIVE_CLAIM_STORAGE_KEY, JSON.stringify(existing.slice(0, 25)));
    } catch (error) {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }

  function loadLiveClaim() {
    try {
      var raw = window.localStorage.getItem(LIVE_CLAIM_STORAGE_KEY) || window.localStorage.getItem('proofcheck:last-finalized-claim') || '[]';
      var stored = JSON.parse(raw);
      var records = Array.isArray(stored) ? stored : stored ? [stored] : [];
      var tx = new URLSearchParams(window.location.search).get('tx');
      return (tx ? records.find(function (item) { return item && item.tx_id === tx; }) : records[0]) || null;
    } catch (error) {
      return null;
    }
  }

  function readCalldataLeb128(bytes, cursor) {
    var result = 0n;
    var shift = 0n;
    while (cursor.index < bytes.length) {
      var byte = bytes[cursor.index];
      cursor.index += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if (byte < 128) return result;
      shift += 7n;
    }
    throw new Error('Invalid GenLayer calldata: truncated integer.');
  }

  function decodeStudioCalldataValue(bytes, cursor) {
    var encoded = readCalldataLeb128(bytes, cursor);
    var type = Number(encoded & 7n);
    var size = encoded >> 3n;
    if (type === 0) {
      if (size === 0n) return null;
      if (size === 1n) return false;
      if (size === 2n) return true;
      if (size === 3n) {
        var address = bytes.slice(cursor.index, cursor.index + 20);
        cursor.index += 20;
        return address;
      }
      throw new Error('Invalid GenLayer calldata: unknown special value.');
    }
    if (type === 1) return size;
    if (type === 2) return -1n - size;
    if (type === 3 || type === 4) {
      var end = cursor.index + Number(size);
      if (end > bytes.length) throw new Error('Invalid GenLayer calldata: truncated value.');
      var raw = bytes.slice(cursor.index, end);
      cursor.index = end;
      return type === 4 ? new TextDecoder('utf-8').decode(raw) : raw;
    }
    if (type === 5) {
      var items = [];
      for (var itemIndex = 0; itemIndex < Number(size); itemIndex += 1) {
        items.push(decodeStudioCalldataValue(bytes, cursor));
      }
      return items;
    }
    if (type === 6) {
      var map = new Map();
      for (var mapIndex = 0; mapIndex < Number(size); mapIndex += 1) {
        var keyLength = Number(readCalldataLeb128(bytes, cursor));
        var keyEnd = cursor.index + keyLength;
        if (keyEnd > bytes.length) throw new Error('Invalid GenLayer calldata: truncated map key.');
        var key = new TextDecoder('utf-8').decode(bytes.slice(cursor.index, keyEnd));
        cursor.index = keyEnd;
        map.set(key, decodeStudioCalldataValue(bytes, cursor));
      }
      return map;
    }
    throw new Error('Invalid GenLayer calldata: unknown type.');
  }

  function decodeStudioCalldata(bytes) {
    var cursor = { index: 0 };
    var decoded = decodeStudioCalldataValue(bytes, cursor);
    if (cursor.index !== bytes.length) throw new Error('Invalid GenLayer calldata: trailing bytes.');
    return decoded;
  }

  async function loadLiveClaimFromChain(txId) {
    if (!txId || !config.rpcUrl) return null;
    var rpc = async function (method, params) {
      var response = await fetch(config.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params }),
      });
      var payload = await response.json();
      if (payload && payload.error) throw new Error(payload.error.message || 'RPC request failed.');
      return payload && payload.result;
    };
    var statusResult = await rpc('gen_getTransactionStatus', [{ txId: txId }]);
    var status = String(statusResult && (statusResult.status || statusResult.statusCode || '')).toUpperCase();
    if (status !== 'FINALIZED' && status !== '7') return null;
    var receipt = await rpc('eth_getTransactionReceipt', [txId]);
    if (!receipt || String(receipt.status).toLowerCase() !== '0x1') return null;
    var transaction = await rpc('eth_getTransactionByHash', [txId]);
    if (!transaction || !transaction.data || !transaction.data.calldata) return null;

    var binary = atob(transaction.data.calldata);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    var decoded = decodeStudioCalldata(bytes);
    var method = decoded instanceof Map ? (decoded.get('method') || decoded.get('')) : (decoded.method || decoded['']);
    var args = decoded instanceof Map ? decoded.get('args') : decoded.args;
    if (method !== 'submit_claim' || !Array.isArray(args) || args.length < 2) return null;
    var decodedResult = extractVerdictFromTransaction(transaction);
    var record = {
      claim_text: String(args[0]),
      evidence_url: String(args[1]),
      submitter: transaction.from_address || transaction.from || '',
      tx_id: txId,
      submitted_at: transaction.created_timestamp
        ? new Date(Number(transaction.created_timestamp) * 1000).toISOString()
        : new Date().toISOString(),
      checked_at: decodedResult && decodedResult.checked_at ? decodedResult.checked_at : '',
      evidence_hash: decodedResult && decodedResult.evidence_hash ? decodedResult.evidence_hash : '',
      contract_address: config.contractAddress,
      contract_version: config.contractVersion,
      verdict: decodedResult ? decodedResult.verdict : 'Submitted',
      reason: decodedResult && decodedResult.reason
        ? decodedResult.reason
        : 'The transaction is finalized. The submitted claim and evidence reference are recorded onchain.',
    };
    saveLiveClaim(record);
    return record;
  }

  function shortValue(value) {
    if (!value) return '—';
    var text = String(value);
    return text.length > 26 ? text.slice(0, 12) + '…' + text.slice(-10) : text;
  }

  function formatEvidenceUrl(url) {
    return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '') + ' ↗';
  }

  function decodeValidatorResult(result) {
    if (typeof result !== 'string') return null;
    try {
      var binary = atob(result);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      var cursor = { index: bytes[0] === 0 ? 1 : 0 };
      var structured = decodeStudioCalldataValue(bytes, cursor);
      if (cursor.index === bytes.length && structured instanceof Map) {
        var structuredVerdict = structured.get('verdict');
        var structuredCheckedAt = structured.get('checked_at');
        var structuredHash = structured.get('evidence_hash');
        var structuredReason = structured.get('reason');
        if (structuredVerdict) {
          return {
            verdict: String(structuredVerdict).charAt(0).toUpperCase() + String(structuredVerdict).slice(1).toLowerCase(),
            reason: String(structuredReason || ''),
            evidence_hash: String(structuredHash || ''),
            checked_at: String(structuredCheckedAt || ''),
          };
        }
      }
      var text = new TextDecoder().decode(bytes);
      var verdictIndex = text.toLowerCase().lastIndexOf('verdict');
      if (verdictIndex < 0) return null;
      var verdictMatch = text.slice(verdictIndex + 7).match(/(SUPPORTED|REFUTED|INSUFFICIENT)/i);
      var reasonIndex = text.toLowerCase().lastIndexOf('reason', verdictIndex);
      var evidenceHashIndex = text.toLowerCase().lastIndexOf('evidence_hash', reasonIndex);
      var checkedAt = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+\-]\d{2}:\d{2}/);
      var evidenceHash = evidenceHashIndex >= 0
        ? text.slice(evidenceHashIndex + 13, reasonIndex).match(/[a-f0-9]{32,64}/i)
        : null;
      var reason = reasonIndex >= 0
        ? text.slice(reasonIndex + 6, verdictIndex).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
      return {
        verdict: verdictMatch ? verdictMatch[1].charAt(0).toUpperCase() + verdictMatch[1].slice(1).toLowerCase() : 'Submitted',
        reason: reason,
        evidence_hash: evidenceHash ? evidenceHash[0] : '',
        checked_at: checkedAt ? checkedAt[0] : '',
      };
    } catch (error) {
      return null;
    }
  }

  function extractVerdictFromTransaction(transaction) {
    var consensusData = transaction && transaction.consensus_data;
    var resultGroups = [
      consensusData && consensusData.validator_results,
      consensusData && consensusData.validators,
      transaction && transaction.validators,
    ];
    var results = resultGroups.reduce(function (all, group) {
      return all.concat(Array.isArray(group) ? group : []);
    }, []);
    if (!Array.isArray(results)) return null;
    var parsed = results
      .filter(function (item) { return item && item.result && (!item.vote || String(item.vote).toLowerCase() === 'agree'); })
      .map(function (item) { return decodeValidatorResult(item.result); })
      .filter(Boolean);
    if (!parsed.length) return null;
    var counts = {};
    parsed.forEach(function (item) { counts[item.verdict] = (counts[item.verdict] || 0) + 1; });
    var verdict = parsed[0].verdict;
    parsed.forEach(function (item) {
      if ((counts[item.verdict] || 0) > (counts[verdict] || 0)) verdict = item.verdict;
    });
    var selected = parsed.find(function (item) { return item.verdict === verdict && item.reason; });
    return {
      verdict: verdict,
      reason: selected ? selected.reason : '',
      evidence_hash: selected ? selected.evidence_hash : '',
      checked_at: selected ? selected.checked_at : '',
    };
  }

  function hydrateClaimDetail() {
    if (!document.body.hasAttribute('data-claim-detail')) return;
    var record = loadLiveClaim();
    var txId = new URLSearchParams(window.location.search).get('tx');
    if (txId && (!record || record.verdict === 'Submitted')) {
      loadLiveClaimFromChain(txId).then(function (chainRecord) {
        if (chainRecord) hydrateClaimDetail();
      }).catch(function (error) {
        // Keep the labeled fixture if RPC data is unavailable, but retain a
        // useful diagnostic for local testing instead of swallowing the cause.
        console.warn('ProofCheck claim detail hydration failed:', error);
      });
      if (!record) return;
    }
    if (!record) {
      return;
    }

    var verdict = String(record.verdict || 'Submitted');
    var isSubmittedOnly = verdict === 'Submitted';
    var setText = function (selector, value) {
      var element = $(selector);
      if (element) element.textContent = value;
    };
    var setAttr = function (selector, name, value) {
      var element = $(selector);
      if (element) element.setAttribute(name, value);
    };

    document.title = 'Live claim detail — ProofCheck';
    setText('[data-live-state]', 'LIVE SUBMISSION · FINALIZED ONCHAIN');
    setText('[data-live-claim-title]', record.claim_text || 'Submitted claim');
    setText('[data-live-result-status]', verdict);
    setText('[data-live-result-title]', isSubmittedOnly ? 'Claim submitted successfully.' : 'Evidence result is onchain.');
    setText('[data-live-result-reason]', record.reason || 'The transaction is finalized. The submitted claim and evidence reference are recorded onchain.');
    setText('[data-live-status-result]', verdict + (isSubmittedOnly ? ' — submitted claim.' : ' — evidence result.'));
    setText('[data-live-claim]', record.claim_text || '—');
    setText('[data-live-submitter]', shortValue(record.submitter));
    setText('[data-live-claim-type]', 'GitHub evidence claim');
    setText('[data-live-tx]', shortValue(record.tx_id));
    setAttr('[data-live-tx-link]', 'href', (config.contractExplorer || 'https://explorer-studio-dev.genlayer.com/') + 'tx/' + record.tx_id);
    setText('[data-live-evidence-kicker]', '02 / EVIDENCE · LIVE SUBMISSION');
    setText('[data-live-evidence-heading]', 'Submitted evidence source.');
    setText('[data-live-source-count]', '01');
    setText('[data-live-evidence-section-meta]', '1 LIVE SOURCE');
    setText('[data-live-evidence-title]', formatEvidenceUrl(record.evidence_url));
    setAttr('[data-live-evidence-title]', 'href', record.evidence_url);
    setText('[data-live-evidence-excerpt]', 'This GitHub URL was submitted for validator review.');
    setText('[data-live-evidence-card-meta]', 'Submitted ' + new Date(record.submitted_at).toLocaleString());
    setText('[data-live-fingerprint]', record.evidence_hash ? shortValue(record.evidence_hash) : 'NOT RETURNED BY CONTRACT');
    setText('[data-live-fingerprint-copy]', 'The deployed contract stores the submitted URL. A content hash is shown when the contract returns one.');
    setText('[data-live-review-count]', 'LIVE SUBMISSION');
    setText('[data-live-history-status]', verdict + ' · live');
    setText('[data-live-history-tx]', shortValue(record.tx_id));
    setText('[data-live-history-copy]', record.reason || 'Finalized transaction recorded for this submitted claim.');
    setText('[data-live-fixture-label]', 'LIVE SUBMISSION');
    setText('[data-live-fixture-copy]', 'This record was created from the latest finalized submission in this browser.');
    setText('[data-live-status-scope]', 'Live submission · ' + shortValue(record.submitter));
    setText('[data-live-checked]', new Date(record.checked_at || record.submitted_at).toLocaleString());
    setText('[data-live-review-version]', record.contract_version || 'studio-0.3.0');
    setText('[data-live-evidence-count]', '01 submitted URL');
    setText('[data-live-consensus]', 'GenLayer · finalized');
    setText('[data-live-payment-note]', 'No verification charge. Studio protocol fee was signed separately by the wallet.');
    setText('[data-live-footer-record]', 'Live submission · ' + shortValue(record.tx_id));
  }

  function setClaimStatus(form, status) {
    var panel = $('[data-claim-status]');
    if (!panel) return;
    var copy = {
      'not-submitted': {
        label: 'Not submitted',
        caption: 'Connect your wallet and submit the claim to begin.',
      },
      checking: {
        label: 'Checking',
        caption: 'GenLayer is reading the evidence and validators are reviewing it.',
      },
      provisional: {
        label: 'Provisional result',
        caption: 'A result is available while finalization completes.',
      },
      finalized: {
        label: 'Finalized onchain',
        caption: 'The transaction is finalized and the contract completed successfully.',
      },
    };
    var selected = copy[status] || copy['not-submitted'];
    var currentIndex = ['not-submitted', 'checking', 'provisional', 'finalized'].indexOf(status);
    panel.dataset.claimStatus = status;
    var label = $('[data-claim-status-label]', panel);
    var caption = $('[data-claim-status-caption]', panel);
    if (label) label.textContent = selected.label;
    if (caption) caption.textContent = selected.caption;
    $$('[data-status-step]', panel).forEach(function (step, index) {
      step.classList.toggle('is-active', index <= currentIndex);
      step.classList.toggle('is-current', index === currentIndex);
    });
  }

  async function ensureWalletForWrite() {
    if (!window.ProofCheckWallet) throw new Error('Wallet connection is unavailable. Reload the page and try again.');
    var wallet = window.ProofCheckWallet.getState();
    if (!wallet.isConnected) {
      await window.ProofCheckWallet.connect('other');
      wallet = window.ProofCheckWallet.getState();
    }
    if (!wallet.isConnected) throw new Error('Connect your wallet before submitting a claim.');
    if (!wallet.isCorrectNetwork) {
      await window.ProofCheckWallet.switchNetwork();
      wallet = window.ProofCheckWallet.getState();
    }
    if (!wallet.isCorrectNetwork) throw new Error('Switch to ' + targetNetworkName() + ' before submitting.');
    return wallet;
  }

  async function loadGenLayerClient(wallet) {
    if (!config.contractAddress) throw new Error('ProofCheck contract is not deployed on this testnet yet.');
    if (config.contractVersion !== 'studio-0.3.0') throw new Error('The configured ProofCheck Studio contract is outdated.');
    if (!state.sdk) {
      var modules = await Promise.all([
        import(config.sdkUrl || 'https://esm.sh/genlayer-js@2.0.0-rc.1?bundle'),
        import(config.chainsUrl || 'https://esm.sh/genlayer-js/chains?bundle'),
      ]);
      state.sdk = modules[0].default || modules[0];
      state.chains = modules[1].default || modules[1];
    }
    var chain = state.chains[config.network]
      || state.chains.studioDevnet
      || state.chains.studio_devnet
      || state.chains.studio_next
      || state.chains['studio-next']
      || state.chains.studionet;
    if (!chain) throw new Error('GenLayer chain configuration was not found.');
    state.client = state.sdk.createClient({
      chain: chain,
      account: wallet.account,
      endpoint: config.rpcUrl,
      provider: wallet.provider,
    });
    return state.client;
  }

  async function waitForStudioFinalization(client, txId) {
    var retries = 120;
    var lastStatus = 'UNKNOWN';
    while (retries > 0) {
      var statusResult = await client.request({
        method: 'gen_getTransactionStatus',
        params: [{ txId: txId }],
      });
      lastStatus = String(statusResult && (statusResult.status || statusResult.statusCode || 'UNKNOWN')).toUpperCase();
      if (lastStatus === 'FINALIZED' || lastStatus === '7') {
        var evmReceipt = await client.request({
          method: 'eth_getTransactionReceipt',
          params: [txId],
        });
        if (!evmReceipt || String(evmReceipt.status).toLowerCase() !== '0x1') {
          throw new Error('Transaction finalized but execution failed.');
        }
        var transactionData = null;
        try {
          transactionData = await client.request({
            method: 'eth_getTransactionByHash',
            params: [txId],
          });
        } catch (error) {
          // The transaction data endpoint is optional on older Studio builds.
        }
        return {
          transactionHash: txId,
          status: '7',
          statusName: 'FINALIZED',
          txExecutionResultName: 'FINISHED_WITH_RETURN',
          evmReceipt: evmReceipt,
          transactionData: transactionData,
        };
      }
      if (lastStatus === 'CANCELED' || lastStatus === '8' || lastStatus === 'VALIDATORS_TIMEOUT' || lastStatus === '12' || lastStatus === 'LEADER_TIMEOUT' || lastStatus === '13') {
        throw new Error('Transaction did not finalize successfully (status: ' + lastStatus + ').');
      }
      await new Promise(function (resolve) { setTimeout(resolve, 5000); });
      retries -= 1;
    }
    throw new Error('Timed out waiting for Studio transaction ' + txId + ' (current status: ' + lastStatus + ').');
  }

  async function submitClaim(form) {
    var wallet = await ensureWalletForWrite();
    var client = await loadGenLayerClient(wallet);
    var claimText = $('#claim', form).value.trim();
    var evidenceUrl = $('#evidence-1', form).value.trim();

    if (!claimText || !evidenceUrl) {
      throw new Error('Complete the claim and add a GitHub evidence URL.');
    }
    if (!/^https:\/\/github\.com\//.test(evidenceUrl)) {
      throw new Error('Evidence must be an https://github.com URL.');
    }

    var write = {
      address: config.contractAddress,
      functionName: 'submit_claim',
      args: [claimText, evidenceUrl],
      value: 0n,
    };
    setClaimStatus(form, 'not-submitted');
    setFormMessage(form, 'Open your wallet to sign the free testnet submission…');
    var estimate;
    if (typeof client.estimateTransactionFeesForWrite === 'function') {
      estimate = await client.estimateTransactionFeesForWrite(write);
    } else if (typeof client.estimateTransactionFees === 'function') {
      // Fallback for older SDK builds without write-specific simulation.
      estimate = await client.estimateTransactionFees({
        leaderTimeunitsAllocation: 125n,
        validatorTimeunitsAllocation: 250n,
        executionBudgetPerRound: 155147700000000n,
        totalMessageFees: 0n,
        appealRounds: 1n,
        rotations: [1n, 1n],
      });
    } else {
      throw new Error('This GenLayer SDK cannot estimate transaction fees.');
    }
    if (!estimate || !estimate.distribution || estimate.feeValue === undefined || BigInt(estimate.feeValue) <= 0n) {
      throw new Error('GenLayer returned an invalid fee estimate. Please try again.');
    }
    var fees = {
      distribution: estimate.distribution,
      feeValue: estimate.feeValue,
    };
    if (estimate.messageAllocations) fees.messageAllocations = estimate.messageAllocations;
    setFormMessage(form, 'Confirm the transaction in your wallet…');
    var txId = await client.writeContract(Object.assign({}, write, { fees: fees }));
    var txLabel = typeof txId === 'string' ? txId : String(txId);
    setClaimStatus(form, 'checking');
    setFormMessage(form, 'GenLayer is checking the evidence…');
    var receipt = null;
    if (state.client && state.client.chain && state.client.chain.isStudio) {
      setFormMessage(form, 'Claim submitted. Waiting for Studio finalization…');
      receipt = await waitForStudioFinalization(client, txId);
      setClaimStatus(form, 'finalized');
    } else if (typeof client.waitForFinalization === 'function') {
      setFormMessage(form, 'Claim submitted. Waiting for GenLayer finalization…');
      receipt = await client.waitForFinalization({ hash: txId, interval: 5000, retries: 120 });
      if (!receipt || typeof state.sdk.isSuccessful !== 'function' || !state.sdk.isSuccessful(receipt)) {
        throw new Error('Transaction finalized with an execution error.');
      }
      setClaimStatus(form, 'finalized');
    }
    var txIdElement = $('[data-tx-id]', form);
    if (txIdElement) txIdElement.textContent = txLabel;
    var decodedResult = extractVerdictFromTransaction(receipt && receipt.transactionData);
    saveLiveClaim({
      claim_text: claimText,
      evidence_url: evidenceUrl,
      submitter: wallet.account,
      tx_id: txLabel,
      submitted_at: new Date().toISOString(),
      checked_at: decodedResult && decodedResult.checked_at ? decodedResult.checked_at : '',
      evidence_hash: decodedResult && decodedResult.evidence_hash ? decodedResult.evidence_hash : '',
      contract_address: config.contractAddress,
      contract_version: config.contractVersion,
      verdict: decodedResult ? decodedResult.verdict : 'Submitted',
      reason: decodedResult && decodedResult.reason
        ? decodedResult.reason
        : 'The transaction is finalized. The submitted claim and evidence reference are recorded onchain.',
    });
    var detailLink = $('[data-claim-detail-link]', form);
    if (detailLink) {
      detailLink.hidden = false;
      detailLink.setAttribute('href', '/records/pc-25-047/?live=1&tx=' + encodeURIComponent(txLabel));
    }
    setFormMessage(form, '✓ Onchain complete. The verification result is ready.');
    return receipt || txId;
  }

  function bindUI() {
    ensureWalletButton();
    ensureModal();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('eip6963:requestProvider'));

    $$('[data-wallet-connect]').forEach(function (button) {
      button.addEventListener('click', function () {
        showModal();
      });
    });

    $$('[data-wallet]').forEach(function (button) {
      button.addEventListener('click', function () {
        connectWallet(button.getAttribute('data-wallet'));
      });
    });

    var closeButton = $('#wallet-modal-close');
    if (closeButton) closeButton.addEventListener('click', hideModal);

    var modal = $('#wallet-modal');
    if (modal) modal.addEventListener('click', function (event) {
      if (event.target === modal) hideModal();
    });

    var switchButton = $('#wallet-switch-network');
    if (switchButton) switchButton.addEventListener('click', switchNetwork);

    var disconnectButton = $('#wallet-disconnect');
    if (disconnectButton) disconnectButton.addEventListener('click', disconnectWallet);

    $$('[data-quick-start]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = $('[name="repo"]', form).value.trim();
        var message = $('[data-quick-message]', form);
        if (!/^https:\/\/github\.com\//.test(value)) {
          if (message) message.textContent = 'Enter a valid GitHub repository URL.';
          return;
        }
        window.location.href = '/submit/?repo=' + encodeURIComponent(value);
      });
    });

    $$('[data-payment-form]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var submitButton = form.querySelector('button[type="submit"]');
        if (submitButton && submitButton.disabled) return;
        if (submitButton) submitButton.disabled = true;
        submitClaim(form).catch(function (error) {
          setFormMessage(form, '× ' + error.message, true);
        }).finally(function () {
          if (submitButton) submitButton.disabled = false;
        });
      });
    });

    $$('[data-rebuttal-form]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        setFormMessage(form, 'Opposing evidence will create a new review when rebuttal submission is enabled.');
      });
    });

    if (window.ethereum && typeof window.ethereum.request === 'function') {
      findProvider('other').then(async function (provider) {
        if (!provider) return;
        var accounts = await provider.request({ method: 'eth_accounts' });
        if (!accounts || !accounts[0]) return;
        state.provider = provider;
        state.account = accounts[0];
        state.chainId = await readChainId(state.provider);
        attachProviderListeners(state.provider);
        renderWalletState();
      }).catch(function () { /* Wallet may be locked or unavailable. */ });
    }

    var repoFromQuery = new URLSearchParams(window.location.search).get('repo');
    var evidenceField = $('#evidence-1');
    if (repoFromQuery && evidenceField && !evidenceField.value) evidenceField.value = repoFromQuery;

    hydrateClaimDetail();
  }

  window.ProofCheckWallet = {
    connect: connectWallet,
    switchNetwork: switchNetwork,
    disconnect: disconnectWallet,
    getState: getWalletState,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUI);
  else bindUI();
}());
