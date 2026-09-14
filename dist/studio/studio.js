document.querySelector('[data-studio-form]').addEventListener('submit', function (event) {
  event.preventDefault();
  var message = document.querySelector('[data-studio-message]');
  var address = document.querySelector('#contract-address').value.trim();
  var repo = document.querySelector('#studio-repo').value.trim();
  var evidence = document.querySelector('#studio-evidence').value.trim();
  if (!repo || !evidence) {
    message.textContent = 'Add both public source URLs to prepare the call.';
    return;
  }
  if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    message.textContent = 'Contract address must be a 42-character 0x address.';
    return;
  }
  message.textContent = address
    ? '✓ Ready to call the deployed contract. Open Studio to submit and finalize.'
    : '✓ Input prepared. Deploy the contract in Studio before submitting on-chain.';
});
