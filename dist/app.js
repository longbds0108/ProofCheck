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
    if (message) message.textContent = form.dataset.success || '✓ Draft saved. You can continue to the next step.';
  });
});
