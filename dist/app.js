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
    if (!window.ethereum) return [];
    return window.ethereum.providers && window.ethereum.providers.length
      ? window.ethereum.providers
      : [window.ethereum];
  }

  function getProvider(walletType) {
    var providers = providerList();
    if (!providers.length) return null;
    if (walletType === 'metamask') {
      return providers.find(function (provider) { return provider.isMetaMask && !provider.isCoinbaseWallet; }) || providers[0];
    }
    if (walletType === 'coinbase') {
      return providers.find(function (provider) { return provider.isCoinbaseWallet; }) || null;
    }
    return providers[0];
  }

  async function findProvider(walletType) {
    var preferred = String(config.preferredAccount || '').toLowerCase();
    var providers = providerList();
    if (preferred) {
      for (var index = 0; index < providers.length; index += 1) {
        try {
          var accounts = await providers[index].request({ method: 'eth_accounts' });
          if ((accounts || []).some(function (account) { return String(account).toLowerCase() === preferred; })) {
            return providers[index];
          }
        } catch (error) {
          // A locked or unavailable provider is skipped.
        }
      }
    }
    return getProvider(walletType);
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
      var preferred = String(config.preferredAccount || '').toLowerCase();
      var selectedAccount = preferred
        ? accounts.find(function (account) { return String(account).toLowerCase() === preferred; })
        : accounts[0];
      if (!selectedAccount) {
        throw new Error('Select wallet account ' + config.preferredAccount + ' in your wallet and try again.');
      }
      state.provider = provider;
      state.account = selectedAccount;
      state.chainId = await readChainId(provider);
      state.listenersAttached = false;
      attachProviderListeners(provider);
      renderWalletState();
      if (state.chainId !== targetChainId()) return false;
      hideModal();
      window.dispatchEvent(new CustomEvent('proofcheck:wallet-connected', { detail: getWalletState() }));
      return true;
    } catch (error) {
      if (error && error.code === 4001) setStatus('Connection was rejected in the wallet.', 'error');
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
    var preferred = String(config.preferredAccount || '').toLowerCase();
    return {
      account: state.account,
      chainId: state.chainId,
      isConnected: Boolean(state.account),
      isCorrectNetwork: state.chainId === targetChainId(),
      isPreferredAccount: !preferred || state.account.toLowerCase() === preferred,
      provider: state.provider,
    };
  }

  function setFormMessage(form, text, isError) {
    var message = $('[data-form-message]', form);
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('is-error', Boolean(isError));
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
    if (wallet.isPreferredAccount === false) {
      throw new Error('Select wallet account ' + config.preferredAccount + ' in your wallet before submitting.');
    }
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
    setFormMessage(form, 'Confirm the transaction in your wallet…');
    // Studio Next simulates the free testnet fee internally. Calling the fee
    // estimator first invokes sim_getFeeConfig, which is not exposed by some
    // Studio RPC versions and prevents the wallet request from being emitted.
    var txId = await client.writeContract(write);
    var txLabel = typeof txId === 'string' ? txId : String(txId);
    var isStudioPreview = Boolean(state.client && state.client.chain && state.client.chain.isStudio);
    setClaimStatus(form, 'checking');
    setFormMessage(form, 'GenLayer is checking the evidence…');
    var receipt = null;
    if (!isStudioPreview && typeof client.waitForFinalization === 'function') {
      setFormMessage(form, 'Claim submitted. Waiting for GenLayer finalization…');
      receipt = await client.waitForFinalization({ hash: txId });
      if (!receipt || typeof state.sdk.isSuccessful !== 'function' || !state.sdk.isSuccessful(receipt)) {
        throw new Error('Transaction finalized with an execution error.');
      }
      setClaimStatus(form, 'finalized');
    }
    var txIdElement = $('[data-tx-id]', form);
    if (txIdElement) txIdElement.textContent = txLabel;
    setFormMessage(form, isStudioPreview
      ? 'Claim is being checked. Open the claim record when consensus is ready.'
      : '✓ Onchain complete. The verification result is ready.');
    return receipt || txId;
  }

  function bindUI() {
    ensureWalletButton();
    ensureModal();

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
        var preferred = String(config.preferredAccount || '').toLowerCase();
        var selectedAccount = preferred
          ? accounts.find(function (account) { return String(account).toLowerCase() === preferred; })
          : accounts[0];
        if (!selectedAccount) return;
        state.provider = provider;
        state.account = selectedAccount;
        state.chainId = await readChainId(state.provider);
        attachProviderListeners(state.provider);
        renderWalletState();
      }).catch(function () { /* Wallet may be locked or unavailable. */ });
    }

    var repoFromQuery = new URLSearchParams(window.location.search).get('repo');
    var evidenceField = $('#evidence-1');
    if (repoFromQuery && evidenceField && !evidenceField.value) evidenceField.value = repoFromQuery;
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
