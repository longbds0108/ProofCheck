/* ProofCheck browser client. The page remains readable without a wallet; writes
   use GenLayerJS only after the user connects an EIP-1193 wallet. */
(function () {
  var config = window.PROOFCHECK_CONFIG || {};
  var state = { account: '', client: null, readClient: null, sdk: null, chains: null, feeWei: 0n };
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var setText = function (selector, value, root) { var el = $(selector, root); if (el) el.textContent = value; };
  var shortAddress = function (address) { return address ? address.slice(0, 6) + '…' + address.slice(-4) : 'Connect wallet'; };
  var weiToGen = function (wei) { return (Number(wei || 0n) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 }); };
  var genToWei = function (value) { return BigInt(Math.round(Number(value || 0) * 1e18)); };
  var message = function (form, text, isError) {
    var el = $('[data-form-message]', form || document);
    if (el) { el.textContent = text; el.classList.toggle('is-error', Boolean(isError)); }
  };

  async function loadSdk() {
    if (state.sdk) return state;
    if (!window.ethereum) throw new Error('Install or unlock an EIP-1193 wallet to continue.');
    var sdkUrl = config.sdkUrl || 'https://esm.sh/genlayer-js?bundle';
    var modules = await Promise.all([import(sdkUrl), import('https://esm.sh/genlayer-js/chains?bundle')]);
    state.sdk = modules[0];
    state.chains = modules[1];
    return state;
  }

  async function connectWallet() {
    await loadSdk();
    var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts[0]) throw new Error('No wallet account was returned.');
    state.account = accounts[0];
    state.client = state.sdk.createClient({ chain: state.chains.studionet, account: state.account, provider: window.ethereum });
    if (state.client.connect) await state.client.connect('studionet');
    $$('[data-wallet-connect]').forEach(function (button) { button.textContent = shortAddress(state.account); button.classList.add('is-connected'); });
    await refreshPaymentPolicy();
    return state.account;
  }

  async function getReadClient() {
    await loadSdk();
    if (!state.readClient) state.readClient = state.sdk.createClient({ chain: state.chains.studionet });
    return state.readClient;
  }

  async function readContract(functionName, args) {
    if (!config.contractAddress) throw new Error('The Studionet contract address is not configured yet.');
    var client = await getReadClient();
    return client.readContract({ address: config.contractAddress, functionName: functionName, args: args || [], jsonSafeReturn: true });
  }

  async function refreshPaymentPolicy() {
    var policy = null;
    try { policy = await readContract('get_payment_policy', []); } catch (error) {
      setText('[data-chain-status]', config.contractAddress ? 'Contract read unavailable' : 'Awaiting Studionet contract');
      return null;
    }
    state.feeWei = BigInt(policy.verification_fee_wei || 0);
    $$('[data-verification-fee]').forEach(function (el) { el.textContent = weiToGen(state.feeWei) + ' GEN'; });
    $$('[data-contract-status]').forEach(function (el) { el.textContent = policy.paused === 'True' ? 'Paused for maintenance' : 'Studionet contract live'; });
    updatePaymentTotal();
    return policy;
  }

  function updatePaymentTotal() {
    var form = $('[data-payment-form]');
    if (!form) return;
    var reward = Math.max(0, Number($('#source-reward', form).value) || 0);
    var baseFee = state.feeWei ? Number(state.feeWei) / 1e18 : 1;
    setText('[data-source-reward]', reward.toFixed(2).replace(/\.00$/, '') + ' GEN', form);
    setText('[data-payment-total]', (baseFee + reward).toFixed(2).replace(/\.00$/, '') + ' GEN before network fee', form);
    setText('[data-network-fee]', 'Estimate after wallet connection', form);
    setText('[data-payment-fee-label]', baseFee.toFixed(2).replace(/\.00$/, '') + ' GEN', form);
  }

  async function submitPaidReview(form) {
    if (!config.contractAddress) throw new Error('The contract address is not configured. Deploy ProofCheck to Studionet first.');
    await connectWallet();
    var reward = genToWei($('#source-reward', form).value);
    var author = $('#source-author', form).value.trim();
    if (reward > 0n && !/^0x[a-fA-F0-9]{40}$/.test(author)) throw new Error('Add a valid source author wallet to include a reward.');
    var evidenceList = [$('#evidence-1', form).value.trim(), $('#evidence-2', form).value.trim()].filter(Boolean);
    var evidenceUrls = evidenceList.join('\n');
    var evidenceNote = $('#evidence-note', form).value.trim();
    message(form, 'Capturing evidence fingerprints…');
    var captured = await captureEvidence(evidenceList, evidenceNote);
    var write = {
      address: config.contractAddress,
      functionName: 'verify_open_source_claim',
      args: [$('#claim-type', form).value, $('#claim', form).value.trim(), $('#repo', form).value.trim(), evidenceUrls, captured.hashes.join('\n'), captured.excerpts.join('\n'), author, reward],
      value: state.feeWei + reward
    };
    message(form, 'Estimating the GenLayer network fee…');
    var estimate = await state.client.estimateTransactionFeesForWrite(write);
    setText('[data-network-fee]', weiToGen(estimate.feeValue) + ' GEN estimated', form);
    message(form, 'Waiting for wallet signature…');
    var txId = await state.client.writeContract({ ...write, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
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
    for (var i = 0; i < urls.length; i += 1) {
      try {
        var response = await fetch(urls[i], { credentials: 'omit' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var body = await response.text();
        var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
        hashes.push(Array.from(new Uint8Array(bytes)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''));
        excerpts.push(body.replace(/\s+/g, ' ').trim().slice(0, 320));
      } catch (error) {
        hashes.push('');
        excerpts.push(fallbackExcerpt.slice(0, 320));
      }
    }
    return { hashes: hashes, excerpts: excerpts };
  }

  async function submitRebuttal(form) {
    var claimId = document.body.dataset.claimId;
    if (!claimId) throw new Error('This detail page is missing a claim id.');
    if (!config.contractAddress) throw new Error('The contract address is not configured.');
    await connectWallet();
    var write = {
      address: config.contractAddress,
      functionName: 'submit_rebuttal',
      args: [claimId, $('#counter-url', form).value.trim(), '', $('#counter-point', form).value.trim(), '', 0n],
      value: state.feeWei
    };
    message(form, 'Estimating the network fee…');
    var estimate = await state.client.estimateTransactionFeesForWrite(write);
    setText('[data-network-fee]', weiToGen(estimate.feeValue) + ' GEN estimated', form);
    var txId = await state.client.writeContract({ ...write, fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
    setText('[data-tx-id]', txId, form);
    message(form, 'Rebuttal submitted. Waiting for finalization…');
    var receipt = await state.client.waitForFinalization({ hash: txId });
    if (state.sdk.isSuccessful && !state.sdk.isSuccessful(receipt)) throw new Error('Rebuttal finalized with an execution error.');
    message(form, '✓ New review finalized. Reload the detail page to read the updated history.');
    return receipt;
  }

  async function loadClaimDetail() {
    if (!document.body.dataset.claimId || !config.contractAddress) return;
    try {
      var claimId = new URLSearchParams(window.location.search).get('claim') || document.body.dataset.claimId;
      var claim = await readContract('get_claim', [claimId]);
      var reviews = (await readContract('get_reviews', [claimId]) || []).filter(function (item) { return item.claim_id === claimId; });
      var evidence = (await readContract('get_evidence', [claimId]) || []).filter(function (item) { return item.claim_id === claimId; });
      if (!claim || !claim.claim_id) throw new Error('Claim not found');
      document.body.dataset.claimId = claim.claim_id;
      setText('.detail-head h1', claim.claim_text);
      setText('.detail-page .claim-quote, .detail-page blockquote', '“' + claim.claim_text + '”');
      setText('.detail-page .claim-meta', 'Submitted by ' + shortAddress(claim.submitter) + ' · ' + claim.claim_type);
      var current = reviews[reviews.length - 1] || {};
      setText('.result-status', current.status || 'insufficient');
      setText('.result-row h2', current.status === 'supported' ? 'Evidence fits the claim.' : current.status === 'refuted' ? 'Evidence conflicts with the claim.' : 'Evidence is not conclusive.');
      setText('.result-reason', current.reason || 'No explanation was returned.');
      setText('.result-score strong', String(evidence.length).padStart(2, '0'));
      setText('.result-score span', 'evidence\nreviewed');
      var evidenceStack = $('.evidence-stack');
      if (evidenceStack) evidenceStack.innerHTML = evidence.map(function (item) {
        return '<div class="evidence-card"><span class="evidence-icon">' + (item.relation === 'opposing' ? '!' : '✓') + '</span><div><div class="block-label">' + item.relation.toUpperCase() + ' EVIDENCE</div><a class="evidence-title evidence-url" href="' + item.url + '" target="_blank" rel="noreferrer">' + item.url.replace(/^https?:\/\//, '') + ' ↗</a><p class="evidence-excerpt">' + (item.excerpt || 'No excerpt supplied.') + '</p><div class="evidence-meta">' + (item.content_hash ? 'SHA-256 ' + item.content_hash.slice(0, 12) + '…' : 'Fingerprint unavailable') + ' · captured ' + item.captured_at + '</div></div></div>';
      }).join('');
      var historyList = $('.history-list');
      if (historyList) historyList.innerHTML = reviews.slice().reverse().map(function (item, index) {
        return '<div class="history-item ' + (index === 0 ? 'current' : '') + '"><div class="history-marker">' + item.version + '</div><div><div class="history-top"><strong>' + item.status + (index === 0 ? ' · current' : '') + '</strong><span class="mono">' + item.created_at + '</span></div><p>' + item.reason + '</p></div></div>';
      }).join('') || '<div class="counter-item"><div class="block-label">NO REVIEWS YET</div><p>Submit the first paid review to create the public audit trail.</p></div>';
      setText('[data-live-state]', 'LIVE CONTRACT · ' + claim.claim_id);
      setText('[data-review-count]', reviews.length + ' REVIEW ' + (reviews.length === 1 ? 'EVENT' : 'EVENTS'));
    } catch (error) {
      setText('[data-live-state]', 'LIVE CONTRACT READ FAILED');
    }
  }

  $$('[data-wallet-connect]').forEach(function (button) {
    button.addEventListener('click', async function () {
      button.disabled = true;
      try { await connectWallet(); } catch (error) { button.textContent = 'Connect wallet'; alert(error.message); }
      button.disabled = false;
    });
  });

  loadClaimDetail();

  $$('[data-payment-form]').forEach(function (form) {
    var reward = $('#source-reward', form);
    if (reward) reward.addEventListener('input', updatePaymentTotal);
    updatePaymentTotal();
    refreshPaymentPolicy();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitPaidReview(form).catch(function (error) { message(form, '× ' + error.message, true); });
    });
  });

  $$('[data-rebuttal-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitRebuttal(form).catch(function (error) { message(form, '× ' + error.message, true); });
    });
  });

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
