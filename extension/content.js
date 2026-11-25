// KDM — shows a small "Download with KDM" button over a playing video, like IDM does.
// The button only exists while the mouse is over a large <video>; it reads nothing from the page.
(() => {
  if (window.__kdmVideoButton) return;
  window.__kdmVideoButton = true;
  const api = globalThis.chrome;
  const MIN_W = 240;
  const MIN_H = 135;
  let host = null;
  let button = null;
  let video = null;
  let hideTimer = 0;
  let last = 0;
  let overButton = false;

  function build() {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none;left:0;top:0;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML =
      '<style>button{all:initial;box-sizing:border-box;font:600 12px/1 system-ui,sans-serif;color:#fff;background:#b45309;' +
      'border:1px solid #f29e34;border-radius:8px;padding:7px 11px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.45)}' +
      'button:hover{background:#c2610a}button:disabled{opacity:.75;cursor:default}</style><button type="button">⬇ Download with KDM</button>';
    button = root.querySelector('button');
    button.addEventListener('mouseenter', () => { overButton = true; clearTimeout(hideTimer); });
    button.addEventListener('mouseleave', () => { overButton = false; });
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      send();
    });
    (document.fullscreenElement || document.documentElement).appendChild(host);
  }

  function label(text, ms) {
    button.textContent = text;
    if (ms) setTimeout(() => { button.textContent = '⬇ Download with KDM'; button.disabled = false; }, ms);
  }

  function send() {
    if (!video) return;
    button.disabled = true;
    label('Sending…');
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      if (res && res.ok) label('✓ Sent to KDM', 2500);
      else if (res && res.reason === 'none') label('No video file found yet — press play first', 3500);
      else if (res && res.reason === 'no-token') label('Not paired yet: paste the token in the KDM extension options', 5000);
      else if (res && res.reason === 'bad-token') label('Wrong token: copy it again from KDM \u2192 Settings', 5000);
      else if (res && res.reason === 'offline') label('KDM is not running', 3500);
      else label('Could not send', 3000);
    };
    try {
      api.runtime.sendMessage({ type: 'media-grab', src: video.currentSrc || video.src || '' }).then(finish, () => finish(null));
    } catch {
      finish(null); // the extension was updated while this page was open: reload the page
    }
  }

  let warmedFor = '';
  function warm() { // the video button just appeared: let KDM read this page now (background asks only for known video sites)
    if (warmedFor === location.href) return;
    warmedFor = location.href;
    try { api.runtime.sendMessage({ type: 'prewarm' }).catch(() => {}); } catch { /* extension reloaded */ }
  }

  function place(v) {
    const r = v.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + 8, 4), window.innerWidth - 190);
    const y = Math.min(Math.max(r.top + 8, 4), window.innerHeight - 36);
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.style.display = 'block';
    warm();
  }

  function hide() {
    if (host) host.style.display = 'none';
    video = null;
  }

  function videoAt(x, y) {
    for (const v of document.getElementsByTagName('video')) {
      const r = v.getBoundingClientRect();
      if (r.width >= MIN_W && r.height >= MIN_H && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return v;
    }
    return null;
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      const now = Date.now();
      if (now - last < 150) return;
      last = now;
      const v = videoAt(e.clientX, e.clientY);
      if (v) {
        clearTimeout(hideTimer);
        if (!host) build();
        if (v !== video) {
          video = v;
          button.disabled = false;
          button.textContent = '⬇ Download with KDM';
        }
        place(v);
      } else if (video && !overButton) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 1200);
      }
    },
    { passive: true, capture: true },
  );
})();
