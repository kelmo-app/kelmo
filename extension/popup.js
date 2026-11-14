const api = globalThis.chrome;
const M = globalThis.KdmMedia;
const $ = (id) => document.getElementById(id);

const sizeText = (n) => (!n ? '' : n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`);

api.runtime.sendMessage({ type: 'status' }).then((r) => {
  $('s').textContent = !r || !r.running ? '● KDM is not running' : r.paired ? '● Connected' : '● Running — token missing';
});

function row(tabId, title, e) {
  const div = document.createElement('div');
  div.className = 'item';
  const stream = e.kind === 'dash'; // DASH (.mpd) is not supported yet; HLS is
  const name = document.createElement('div');
  name.className = 'n';
  const top = document.createElement('div');
  top.textContent = stream ? 'Streaming video (DASH)' : M.suggestName(title, e.url, e.kind === 'hls' ? 'mp4' : e.ext);
  const sub = document.createElement('div');
  sub.className = 'muted';
  sub.textContent = stream ? 'Not supported yet' : e.kind === 'hls' ? 'Stream (HLS) · KDM joins the pieces' : [e.kind === 'audio' ? 'Audio' : 'Video', e.ext.toUpperCase(), sizeText(e.size)].filter(Boolean).join(' · ');
  name.append(top, sub);
  const btn = document.createElement('button');
  btn.textContent = 'Download';
  btn.disabled = stream;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const res = await api.runtime.sendMessage({ type: 'media-send', tabId, url: e.url, ext: e.ext }).catch(() => null);
    btn.textContent = res && res.ok ? '✓ Sent' : 'Failed';
  });
  div.append(name, btn);
  return div;
}

if (M) {
  api.runtime.sendMessage({ type: 'media-list' }).then((r) => {
    const box = $('v');
    if (r && r.site) {
      const div = document.createElement('div');
      div.className = 'item';
      const name = document.createElement('div');
      name.className = 'n';
      const top = document.createElement('div');
      top.textContent = r.title || 'This video';
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.textContent = 'Video page · KDM lets you pick the quality';
      name.append(top, sub);
      const btn = document.createElement('button');
      btn.textContent = 'Download';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const res = await api.runtime.sendMessage({ type: 'page-send', url: r.site }).catch(() => null);
        btn.textContent = res && res.ok ? '✓ Sent' : 'Failed';
      });
      div.append(name, btn);
      box.append(div);
      return;
    }
    if (!r || !r.list || !r.list.length) {
      const p = document.createElement('div');
      p.className = 'muted';
      p.style.marginBottom = '10px';
      p.textContent = 'No video found on this page yet. Press play, then open this again.';
      box.append(p);
      return;
    }
    for (const e of r.list) box.append(row(r.tabId, r.title, e));
  }).catch(() => {});
}
$('opt').addEventListener('click', () => api.runtime.openOptionsPage());
