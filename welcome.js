(() => {
  const key = 'zot_welcome_ack_v1';
  const dialog = document.getElementById('welcomeDialog');
  let acknowledged = false;
  try { acknowledged = localStorage.getItem(key) === 'yes'; } catch {}
  if (acknowledged) return;
  dialog.addEventListener('cancel', event => event.preventDefault());
  document.getElementById('welcomeConfirm').addEventListener('click', () => {
    // Storage may be unavailable in private/restricted browsing; still let people continue.
    try { localStorage.setItem(key, 'yes'); } catch {}
    dialog.close();
    document.getElementById('q').focus({ preventScroll: true });
  });
  dialog.showModal();
})();
