document.querySelectorAll('[data-filter]').forEach(function (button) {
  button.addEventListener('click', function () {
    document.querySelectorAll('[data-filter]').forEach(function (item) { item.classList.remove('is-active'); });
    button.classList.add('is-active');
    var filter = button.dataset.filter;
    document.querySelectorAll('[data-record-status]').forEach(function (record) {
      record.hidden = filter !== 'all' && record.dataset.recordStatus !== filter;
    });
  });
});

document.querySelectorAll('[data-demo-form]').forEach(function (form) {
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var message = form.querySelector('[data-form-message]');
    if (form.matches('[data-payment-form]')) {
      var reward = Math.max(0, Number(form.querySelector('#source-reward').value) || 0);
      var author = form.querySelector('#source-author').value.trim();
      if (reward > 0 && !/^0x[a-fA-F0-9]{40}$/.test(author)) {
        if (message) message.textContent = 'Add a valid source author wallet to include a reward.';
        return;
      }
    }
    if (message) message.textContent = form.dataset.success || '✓ Draft saved. You can continue to the next step.';
  });
});

var paymentForm = document.querySelector('[data-payment-form]');
if (paymentForm) {
  var rewardInput = paymentForm.querySelector('#source-reward');
  var rewardOutput = paymentForm.querySelector('[data-source-reward]');
  var totalOutput = paymentForm.querySelector('[data-payment-total]');
  var formatGen = function (value) { return (Number.isInteger(value) ? value : value.toFixed(2)) + ' GEN'; };
  var updatePaymentTotal = function () {
    var reward = Math.max(0, Number(rewardInput.value) || 0);
    if (rewardOutput) rewardOutput.textContent = formatGen(reward);
    if (totalOutput) totalOutput.textContent = formatGen(1 + reward);
  };
  rewardInput.addEventListener('input', updatePaymentTotal);
  updatePaymentTotal();
}
