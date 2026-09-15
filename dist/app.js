/* ProofCheck browser client. The page remains readable without a wallet; writes
   use GenLayerJS only after the user connects an EIP-1193 wallet. */

// Ensure DOM is ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
(function () {
  var config = window.PROOFCHECK_CONFIG || {};
  var state = { account: '', client: null, readClient: null, sdk: null, chains: null, feeWei: 0n };
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var setText = function (selector, value, root) { var el = $(selector, root); if (el) el.textContent = value; };
  var shortAddress = function (address) { return address ? address.slice(0, 6) + '…' + address.slice(-4) : 'Connect wallet'; };
  var weiToGen = function (wei) { return (Number(wei || 0n) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 }); };
  var genToWei = function (value) { return BigInt(Math.round(Number(value || 0) * 1e18)); };
  var renderTreasury = function (address) { /* Treasury address display removed for MVP */ };
  var message = function (form, text, isError) {
    var el = $('[data-form-message]', form || document);
    if (el) { el.textContent = text; el.classList.toggle('is-error', Boolean(isError)); }
  };

  async function loadSdk() {
    if (state.sdk) return state;
    if (!window.ethereum) throw new Error('Install or unlock an EIP-1193 wallet to continue.');
    var sdkUrl = config.sdkUrl || 'https://esm.sh/genlayer-js?bundle';
    try {
      var sdkPromise = import(sdkUrl);
      var chainsPromise = import('https://esm.sh/genlayer-js/chains?bundle');
      var timeout = new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('SDK import timeout - GenLayer service unavailable')); }, 15000);
      });
      var modules = await Promise.race([Promise.all([sdkPromise, chainsPromise]), timeout]);
      state.sdk = modules[0];
      state.chains = modules[1];
      console.log('SDK loaded successfully');
    } catch (error) {
      console.error('SDK load error:', error);
      throw new Error('Failed to load GenLayer SDK. Please check your internet connection: ' + error.message);
    }
    return state;
  }

  async function testRpc(rpcUrl) {
    try {
      var response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var data = await response.json();
      if (data.result) {
        console.log('RPC working:', rpcUrl, 'Chain:', data.result);
        return true;
      }
    } catch (error) {
      console.warn('RPC test failed:', rpcUrl, error.message);
    }
    return false;
  }

  async function findWorkingRpc() {
    var rpcUrls = config.rpcUrls || [config.rpcUrl];
    for (var i = 0; i < rpcUrls.length; i++) {
      if (await testRpc(rpcUrls[i])) {
        config.rpcUrl = rpcUrls[i];
        return rpcUrls[i];
      }
    }
    console.warn('No working RPC found, using default');
    return config.rpcUrl;
  }

  async function connectWallet(walletType) {
    try {
      await loadSdk();
      await findWorkingRpc();

      // Check for wallet availability
      if (!window.ethereum) {
        throw new Error('No EVM wallet found. Please install MetaMask, Coinbase Wallet, or another EIP-1193 wallet.');
      }

      console.log('Detected wallet:', window.ethereum.isMetaMask ? 'MetaMask' : window.ethereum.isCoinbaseWallet ? 'Coinbase' : 'Other EVM wallet');

      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        throw new Error('No account selected. Please approve the connection in your wallet.');
      }
      state.account = accounts[0];
      console.log('Connected account:', state.account);

      // Get current chain ID from wallet
      var chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      var currentChainId = parseInt(chainIdHex, 16);
      console.log('Current chain ID:', currentChainId);

      // Check if on correct network - contract is on Bradbury Testnet (4221)
      var contractChainId = config.chainId || 4221;
      if (currentChainId !== contractChainId) {
        state.wrongNetwork = true;
        console.warn('Wrong network. Current:', currentChainId, 'Expected:', contractChainId);
        throw new Error('Please switch to GenLayer Chain ' + contractChainId + '. Your wallet is on: ' + currentChainId);
      }

      state.wrongNetwork = false;

      // Try to find the correct chain
      var chain = null;
      console.log('Available chains:', Object.keys(state.chains));

      // Try different chain names
      if (state.chains['studio-next']) {
        chain = state.chains['studio-next'];
        console.log('Using studio-next chain');
      } else if (state.chains.studio_next) {
        chain = state.chains.studio_next;
        console.log('Using studio_next chain');
      } else if (state.chains.studionet) {
        chain = state.chains.studionet;
        console.log('Using studionet chain (fallback)');
      } else {
        // Try to find any available chain that's not mainnet
        var availableChains = Object.keys(state.chains).filter(function(k) {
          return k.indexOf('main') === -1 && k.indexOf('ethereum') === -1;
        });
        if (availableChains.length > 0) {
          chain = state.chains[availableChains[0]];
          console.log('Using fallback chain:', availableChains[0]);
        }
      }

      if (!chain) {
        throw new Error('GenLayer Studio Next chain not found. Available: ' + Object.keys(state.chains).join(', '));
      }

      // Create client with explicit chain
      try {
        state.client = state.sdk.createClient({
          chain: chain,
          account: state.account,
          provider: window.ethereum
        });
        console.log('Client created successfully');
      } catch (clientError) {
        console.warn('Client creation error (non-critical):', clientError);
        // GenLayer SDK may warn about missing methods, but client is still usable
        state.client = state.sdk.createClient({
          chain: chain,
          account: state.account,
          provider: window.ethereum
        });
      }

      $$('[data-wallet-connect]').forEach(function (button) {
        button.textContent = shortAddress(state.account);
        button.classList.add('is-connected');
      });

      updateWalletDisplay();
      await refreshPaymentPolicy();
      return state.account;
    } catch (error) {
      console.error('Wallet connection error:', error);
      var errorMsg = 'Wallet connection failed';
      if (error.message) {
        errorMsg += ': ' + error.message;
      }
      alert(errorMsg);
      throw error;
    }
  }

  async function getReadClient() {
    try {
      await loadSdk();
      if (!state.readClient) {
        var chain = state.chains.studio_next || state.chains.studionet || Object.values(state.chains)[0];
        if (!chain) {
          throw new Error('GenLayer chain not available');
        }
        try {
          state.readClient = state.sdk.createClient({ chain: chain });
        } catch (clientErr) {
          console.warn('Read client creation warning (proceeding):', clientErr.message);
          state.readClient = state.sdk.createClient({ chain: chain });
        }
      }
      return state.readClient;
    } catch (error) {
      console.error('Failed to create read client:', error);
      throw error;
    }
  }

  async function readContract(functionName, args) {
    // Use mock contract if no real contract address is configured
    if (!config.contractAddress) {
      if (window.MOCK_CONTRACT && window.MOCK_CONTRACT[functionName]) {
        return window.MOCK_CONTRACT[functionName](...(args || []));
      }
      throw new Error('The Studionet contract address is not configured yet.');
    }
    var client = await getReadClient();
    return client.readContract({ address: config.contractAddress, functionName: functionName, args: args || [], jsonSafeReturn: true });
  }

  async function refreshPaymentPolicy() {
    var policy = null;
    try {
      policy = await readContract('get_payment_policy', []);
    } catch (error) {
      console.warn('Payment policy load failed:', error);
      setText('[data-chain-status]', config.contractAddress ? 'Contract read unavailable' : 'Awaiting Studio Next contract');
      renderTreasury(config.treasuryAddress);
      return null;
    }
    try {
      state.feeWei = BigInt(policy.verification_fee_wei || 0);
      renderTreasury(policy.treasury_address || config.treasuryAddress);
      $$('[data-verification-fee]').forEach(function (el) { el.textContent = weiToGen(state.feeWei) + ' GEN'; });
      var isPaused = String(policy.paused).toLowerCase() === 'true';
      $$('[data-contract-status]').forEach(function (el) { el.textContent = isPaused ? 'Paused for maintenance' : 'Studio Next contract live'; });
      updatePaymentTotal();
    } catch (error) {
      console.warn('Payment policy parse failed:', error);
    }
    return policy;
  }

  function updatePaymentTotal() {
    var form = $('[data-payment-form]');
    if (!form) return;
    var baseFee = state.feeWei ? Number(state.feeWei) / 1e18 : 1;
    setText('[data-payment-total]', baseFee.toFixed(2).replace(/\.00$/, '') + ' GEN before network fee', form);
    setText('[data-network-fee]', 'Estimate after wallet connection', form);
    setText('[data-payment-fee-label]', baseFee.toFixed(2).replace(/\.00$/, '') + ' GEN', form);
  }

  async function submitPaidReview(form) {
    try {
      await loadSdk();
      if (!state.sdk || !state.chains) throw new Error('SDK not properly initialized');
    } catch (error) {
      message(form, '× Failed to load SDK: ' + error.message, true);
      throw error;
    }
    var evidenceList = [$('#evidence-1', form).value.trim(), $('#evidence-2', form).value.trim()].filter(Boolean);
    var evidenceUrls = evidenceList.join('\n');
    var evidenceNote = $('#evidence-note', form).value.trim();
    message(form, 'Capturing evidence fingerprints…');
    var captured = await captureEvidence(evidenceList, evidenceNote);

    // Use mock contract if no real contract address
    if (!config.contractAddress && window.MOCK_CONTRACT) {
      message(form, 'Processing claim with mock contract…');
      var result = await window.MOCK_CONTRACT.verifyClaim(
        $('#claim-type', form).value,
        $('#claim', form).value.trim(),
        $('#repo', form).value.trim(),
        evidenceUrls,
        captured.hashes.join('\n'),
        captured.excerpts.join('\n'),
        '',
        0n
      );
      var txId = 'MOCK-' + Date.now();
      setText('[data-tx-id]', txId, form);
      message(form, '✓ Claim submitted (mock mode). Result: ' + result.status);
      form.reset();
      updatePaymentTotal();
      return result;
    }

    // Real contract flow
    await connectWallet();
    var write = {
      address: config.contractAddress,
      functionName: 'verify_open_source_claim',
      args: [$('#claim-type', form).value, $('#claim', form).value.trim(), $('#repo', form).value.trim(), evidenceUrls, captured.hashes.join('\n'), captured.excerpts.join('\n'), '', 0n],
      value: state.feeWei
    };
    message(form, 'Estimating the GenLayer network fee…');
    var txId;
    var chain = state.chains['studio-next'] || state.chains.studio_next || Object.values(state.chains)[0];
    if (!chain) throw new Error('GenLayer chain not available');
    try {
      var estimate = await state.client.estimateTransactionFeesForWrite(write);
      setText('[data-network-fee]', weiToGen(estimate.feeValue) + ' GEN estimated', form);
      message(form, 'Waiting for wallet signature…');
      // Recreate client to ensure latest nonce
      state.client = state.sdk.createClient({ chain: chain, account: state.account, provider: window.ethereum });
      txId = await state.client.writeContract({ ...write, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
    } catch (feeError) {
      console.warn('Fee estimation failed, proceeding without explicit fee:', feeError);
      setText('[data-network-fee]', 'Network fee applied by GenLayer', form);
      message(form, 'Waiting for wallet signature…');
      // Recreate client to ensure latest nonce
      state.client = state.sdk.createClient({ chain: chain, account: state.account, provider: window.ethereum });
      txId = await state.client.writeContract(write);
    }
    setText('[data-tx-id]', txId, form);
    message(form, 'Transaction submitted. Waiting for GenLayer finalization…');
    var receipt = await state.client.waitForFinalization({ hash: txId });
    if (state.sdk.isSuccessful && !state.sdk.isSuccessful(receipt)) throw new Error('Transaction finalized with an execution error. Check the transaction details.');
    message(form, '✓ Review finalized. Transaction: ' + txId);
    form.reset();
    updatePaymentTotal();
    return receipt;
  }

  async function captureEvidence(urls, fallbackExcerpt) {
    var hashes = [];
    var excerpts = [];
    var corsProxy = 'https://cors-anywhere.herokuapp.com/';
    for (var i = 0; i < urls.length; i += 1) {
      try {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 10000);
        var fetchUrl = urls[i];
        // Use CORS proxy for GitHub URLs
        if (urls[i].includes('github.com')) {
          fetchUrl = corsProxy + urls[i];
        }
        var response = await fetch(fetchUrl, { credentials: 'omit', signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var body = await response.text();
        var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
        hashes.push(Array.from(new Uint8Array(bytes)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''));
        excerpts.push(body.replace(/\s+/g, ' ').trim().slice(0, 320));
      } catch (error) {
        console.warn('Evidence capture failed for ' + urls[i] + ':', error);
        hashes.push('');
        excerpts.push(fallbackExcerpt.slice(0, 320));
      }
    }
    return { hashes: hashes, excerpts: excerpts };
  }

  async function submitRebuttal(form) {
    try {
      await loadSdk();
      if (!state.sdk || !state.chains) throw new Error('SDK not properly initialized');
    } catch (error) {
      message(form, '× Failed to load SDK: ' + error.message, true);
      throw error;
    }
    var claimId = document.body.dataset.claimId;
    if (!claimId) throw new Error('This detail page is missing a claim id.');

    // Use mock contract if no real contract address
    if (!config.contractAddress && window.MOCK_CONTRACT) {
      message(form, 'Processing rebuttal with mock contract…');
      var result = await window.MOCK_CONTRACT.submitRebuttal(
        claimId,
        $('#counter-url', form).value.trim(),
        '',
        $('#counter-point', form).value.trim(),
        '',
        0n
      );
      var txId = 'MOCK-' + Date.now();
      setText('[data-tx-id]', txId, form);
      message(form, '✓ Rebuttal submitted (mock mode). New result: ' + result.status);
      return result;
    }

    // Real contract flow
    await connectWallet();
    var write = {
      address: config.contractAddress,
      functionName: 'submit_rebuttal',
      args: [claimId, $('#counter-url', form).value.trim(), '', $('#counter-point', form).value.trim(), '', 0n],
      value: state.feeWei
    };
    message(form, 'Estimating the network fee…');
    var txId;
    var chain = state.chains['studio-next'] || state.chains.studio_next || Object.values(state.chains)[0];
    if (!chain) throw new Error('GenLayer chain not available');
    try {
      var estimate = await state.client.estimateTransactionFeesForWrite(write);
      setText('[data-network-fee]', weiToGen(estimate.feeValue) + ' GEN estimated', form);
      // Recreate client to ensure latest nonce
      state.client = state.sdk.createClient({ chain: chain, account: state.account, provider: window.ethereum });
      txId = await state.client.writeContract({ ...write, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
    } catch (feeError) {
      console.warn('Fee estimation failed, proceeding without explicit fee:', feeError);
      setText('[data-network-fee]', 'Network fee applied by GenLayer', form);
      // Recreate client to ensure latest nonce
      state.client = state.sdk.createClient({ chain: chain, account: state.account, provider: window.ethereum });
      txId = await state.client.writeContract(write);
    }
    setText('[data-tx-id]', txId, form);
    message(form, 'Rebuttal submitted. Waiting for finalization…');
    var receipt = await state.client.waitForFinalization({ hash: txId });
    if (state.sdk.isSuccessful && !state.sdk.isSuccessful(receipt)) throw new Error('Rebuttal finalized with an execution error.');
    message(form, '✓ New review finalized. Reload the detail page to read the updated history.');
    return receipt;
  }

  async function loadClaimDetail() {
    if (!config.contractAddress) {
      setText('[data-live-state]', 'AWAITING CONTRACT DEPLOYMENT');
      return;
    }
    try {
      var claimId = new URLSearchParams(window.location.search).get('claim') || document.body.dataset.claimId;
      if (!claimId) return;
      var claim = await readContract('get_claim', [claimId]);
      if (!claim || Object.keys(claim).length === 0) {
        setText('[data-live-state]', 'CLAIM NOT FOUND ON CONTRACT');
        return;
      }
      var reviews = await readContract('get_reviews', [claimId]) || [];
      var evidence = await readContract('get_evidence', [claimId]) || [];
      document.body.dataset.claimId = claim.claim_id || claimId;
      setText('.detail-head h1', claim.claim_text || 'Claim detail');
      setText('.detail-page .claim-quote, .detail-page blockquote', '”' + (claim.claim_text || '') + '”');
      setText('.detail-page .claim-meta', 'Submitted by ' + shortAddress(claim.submitter) + ' · ' + (claim.claim_type || ''));
      var current = (Array.isArray(reviews) && reviews[reviews.length - 1]) || {};
      setText('.result-status', current.status || 'pending');
      setText('.result-row h2', current.status === 'supported' ? 'Evidence fits the claim.' : current.status === 'refuted' ? 'Evidence conflicts with the claim.' : 'Review pending or incomplete.');
      setText('.result-reason', current.reason || 'Waiting for validator consensus.');
      var evidenceCount = Array.isArray(evidence) ? evidence.length : 0;
      setText('.result-score strong', String(evidenceCount).padStart(2, '0'));
      var evidenceStack = $('.evidence-stack');
      if (evidenceStack && Array.isArray(evidence) && evidence.length > 0) {
        evidenceStack.innerHTML = evidence.map(function (item) {
          return '<div class=”evidence-card”><span class=”evidence-icon”>' + (item.relation === 'opposing' ? '!' : '✓') + '</span><div><div class=”block-label”>' + (item.relation || 'EVIDENCE').toUpperCase() + '</div><a class=”evidence-title evidence-url” href=”' + (item.url || '#') + '” target=”_blank” rel=”noreferrer”>' + (item.url ? item.url.replace(/^https?:\/\//, '') : 'Evidence') + ' ↗</a><p class=”evidence-excerpt”>' + (item.excerpt || 'No excerpt provided.') + '</p><div class=”evidence-meta”>' + (item.content_hash ? 'SHA-256 ' + item.content_hash.slice(0, 12) + '…' : 'Hash pending') + ' · ' + (item.captured_at || 'Date pending') + '</div></div></div>';
        }).join('');
      }
      var historyList = $('.history-list');
      if (historyList) {
        if (Array.isArray(reviews) && reviews.length > 0) {
          historyList.innerHTML = reviews.slice().reverse().map(function (item, index) {
            return '<div class=”history-item ' + (index === 0 ? 'current' : '') + '”><div class=”history-marker”>' + (item.version || (reviews.length - index)) + '</div><div><div class=”history-top”><strong>' + (item.status || 'pending') + (index === 0 ? ' · current' : '') + '</strong><span class=”mono”>' + (item.created_at || 'pending') + '</span></div><p>' + (item.reason || 'Review in progress…') + '</p></div></div>';
          }).join('');
        } else {
          historyList.innerHTML = '<div class=”counter-item”><div class=”block-label”>NO REVIEWS YET</div><p>Submit the first paid review to create the public audit trail.</p></div>';
        }
      }
      setText('[data-live-state]', 'LIVE CONTRACT · ' + claimId);
      setText('[data-review-count]', (Array.isArray(reviews) ? reviews.length : 0) + ' REVIEW ' + (reviews.length === 1 ? 'EVENT' : 'EVENTS'));
    } catch (error) {
      console.warn('Claim detail load failed:', error);
      setText('[data-live-state]', 'CLAIM READ FAILED: ' + error.message);
    }
  }

  $$('[data-wallet-connect]').forEach(function (button) {
    button.addEventListener('click', async function () {
      button.disabled = true;
      try { await connectWallet(); } catch (error) { button.textContent = 'Connect wallet'; alert(error.message); }
      button.disabled = false;
    });
  });

  renderTreasury(config.treasuryAddress);

  loadClaimDetail();

  $$('[data-payment-form]').forEach(function (form) {
    var reward = $('#source-reward', form);
    if (reward) reward.addEventListener('input', updatePaymentTotal);
    updatePaymentTotal();
    refreshPaymentPolicy();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      var originalText = submitBtn.textContent;
      submitBtn.textContent = 'Processing…';
      submitPaidReview(form).catch(function (error) {
        message(form, '× ' + error.message, true);
        console.error('Submit error:', error);
      }).finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  });

  $$('[data-rebuttal-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      var originalText = submitBtn.textContent;
      submitBtn.textContent = 'Processing…';
      submitRebuttal(form).catch(function (error) {
        message(form, '× ' + error.message, true);
        console.error('Rebuttal error:', error);
      }).finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  });

  // Wallet Button & Menu
  var walletMenu = document.getElementById('wallet-menu');
  var walletButton = document.getElementById('wallet-button');
  var walletDropdown = document.getElementById('wallet-dropdown');
  var walletAddress = document.getElementById('wallet-address');
  var walletAddressCopy = document.getElementById('wallet-address-copy');
  var copyAddressBtn = document.getElementById('copy-address');
  var disconnectBtn = document.getElementById('disconnect-btn');

  // Toggle wallet menu
  if (walletButton) {
    walletButton.addEventListener('click', function(e) {
      e.stopPropagation();
      if (walletDropdown) walletDropdown.classList.toggle('active');
    });
  }

  // Close menu when clicking outside
  document.addEventListener('click', function() {
    if (walletDropdown && walletDropdown.classList.contains('active')) {
      walletDropdown.classList.remove('active');
    }
  });

  // Copy address to clipboard
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var addressToCopy = state.account || (walletAddressCopy ? walletAddressCopy.textContent : '');
      if (!addressToCopy) return;
      navigator.clipboard.writeText(addressToCopy).then(function() {
        var originalText = copyAddressBtn.textContent;
        copyAddressBtn.textContent = '✓ Copied';
        if (walletDropdown) walletDropdown.classList.remove('active');
        setTimeout(function() {
          copyAddressBtn.textContent = addressToCopy;
        }, 1500);
      });
    });
  }

  // Disconnect wallet
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', function(e) {
      e.preventDefault();
      state.account = '';
      state.client = null;
      state.readClient = null;
      if (walletMenu) walletMenu.style.display = 'none';
      if (walletDropdown) walletDropdown.classList.remove('active');
      if (document.getElementById('start-check-btn')) {
        document.getElementById('start-check-btn').style.display = 'inline-flex';
      }
      console.log('Wallet disconnected');
    });
  }

  // Update wallet display
  function updateWalletDisplay() {
    if (state.account && state.account.length >= 4) {
      if (walletAddress) walletAddress.textContent = state.account.slice(0, 6) + '…' + state.account.slice(-4);
      if (walletAddressCopy) walletAddressCopy.textContent = state.account;
      if (document.getElementById('start-check-btn')) {
        document.getElementById('start-check-btn').style.display = 'none';
      }
      if (walletMenu) walletMenu.style.display = 'inline-block';
    }
  }

  // Wallet Modal Setup
  var walletModal = document.getElementById('wallet-modal');
  var walletModalClose = document.getElementById('wallet-modal-close');
  var connectMetamaskBtn = document.getElementById('connect-metamask');

  function showWalletModal() {
    if (walletModal) {
      walletModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function hideWalletModal() {
    if (walletModal) {
      walletModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if (walletModalClose) {
    walletModalClose.addEventListener('click', hideWalletModal);
  }

  if (walletModal) {
    walletModal.addEventListener('click', function(e) {
      if (e.target === walletModal) {
        hideWalletModal();
      }
    });
  }

  // Wallet connection handlers - all use EIP-1193
  var walletOptions = document.querySelectorAll('[data-wallet]');
  walletOptions.forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var walletType = btn.getAttribute('data-wallet');
      try {
        hideWalletModal();

        if (walletType === 'walletconnect') {
          // WalletConnect support - show info for now
          alert('WalletConnect support coming soon! For now, use MetaMask or another EIP-1193 compatible wallet.');
          showWalletModal();
          return;
        }

        // All other wallets use EIP-1193
        console.log('Connecting with wallet type:', walletType);
        await connectWallet(walletType);
        window.location.href = '/submit/';
      } catch (error) {
        console.error('Connection failed:', error);
        alert('Failed to connect ' + walletType + ': ' + error.message);
        showWalletModal();
      }
    });
  });

  // Handle "Start Check" button on homepage
  var startCheckBtn = document.getElementById('start-check-btn');
  if (startCheckBtn) {
    startCheckBtn.addEventListener('click', function (event) {
      event.preventDefault();
      showWalletModal();
    });
  }

  $$('[data-quick-start]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = $('[name="repo"]', form).value.trim();
      if (!/^https:\/\/github\.com\//.test(value)) { setText('[data-quick-message]', 'Enter a valid GitHub repository URL.'); return; }
      window.location.href = '/submit/?repo=' + encodeURIComponent(value);
    });
  });

  $$('[data-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      $$('[data-filter]').forEach(function (item) { item.classList.remove('is-active'); });
      button.classList.add('is-active');
      var filter = button.dataset.filter;
      $$('[data-record-status]').forEach(function (record) { record.hidden = filter !== 'all' && record.dataset.recordStatus !== filter; });
    });
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get('repo') && $('#repo')) $('#repo').value = params.get('repo');
})();
} // End initApp()
