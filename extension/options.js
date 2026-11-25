const api = globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function refresh() {
  const el = $('status');
  const r = await api.runtime.sendMessage({ type: 'status' });
  if (!r || !r.running) { el.className = 'warn'; el.textContent = 'KDM is not running. Open KDM, then reload this page.'; }
  else if (!r.paired) { el.className = 'warn'; el.textContent = 'KDM is running, but pairing did not work. Restart the browser once; if it still fails paste the token below.'; }
  else { el.className = 'ok'; el.textContent = 'Connected to KDM (port ' + r.port + '). Browser downloads will go to KDM.'; }
}

(async () => {
  const s = await api.storage.local.get({ token: '', enabled: true, prewarm: true });
  $('token').value = s.token;
  $('enabled').checked = s.enabled;
  $('prewarm').checked = s.prewarm;
  $('save').addEventListener('click', async () => {
    await api.storage.local.set({ token: $('token').value.trim(), enabled: $('enabled').checked, prewarm: $('prewarm').checked });
    await refresh();
  });
  refresh();
})();
