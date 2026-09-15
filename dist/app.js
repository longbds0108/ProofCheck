/* ProofCheck - UI Only (All features removed) */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}

function initUI() {
  // Simple DOM helpers
  var $ = function(selector) { return document.querySelector(selector); };
  var $$ = function(selector) { return document.querySelectorAll(selector); };

  // Wallet Modal UI
  var walletModal = $('#wallet-modal');
  var startCheckBtn = $('#start-check-btn');

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

  // Start Check button
  if (startCheckBtn) {
    startCheckBtn.addEventListener('click', function(e) {
      e.preventDefault();
      showWalletModal();
    });
  }

  // Close modal button
  var closeBtn = $('#wallet-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideWalletModal);
  }

  // Close when clicking backdrop
  if (walletModal) {
    walletModal.addEventListener('click', function(e) {
      if (e.target === walletModal) {
        hideWalletModal();
      }
    });
  }

  // Wallet option buttons (just UI, no functionality)
  var walletOptions = $$('[data-wallet]');
  walletOptions.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var walletType = btn.getAttribute('data-wallet');
      alert('Wallet: ' + walletType + '\n\n(Functionality removed - UI only)');
    });
  });

  // Form handling (just UI)
  var forms = $$('[data-payment-form]');
  forms.forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      alert('Form submitted!\n\n(Functionality removed - UI only)');
    });
  });

  // Rebuttal form handling (just UI)
  var rebuttalForms = $$('[data-rebuttal-form]');
  rebuttalForms.forEach(function(form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      alert('Rebuttal submitted!\n\n(Functionality removed - UI only)');
    });
  });

  // Filter buttons (just UI)
  var filterButtons = $$('[data-filter]');
  filterButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterButtons.forEach(function(item) {
        item.classList.remove('is-active');
      });
      btn.classList.add('is-active');
      alert('Filter: ' + btn.dataset.filter + '\n\n(Functionality removed - UI only)');
    });
  });

  console.log('✅ ProofCheck UI loaded (features removed)');
}
