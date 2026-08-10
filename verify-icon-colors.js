// Tiny CDP probe: extract computed background-color of each
// .featured-card__icon so we can confirm the per-file-type coloring
// (blue / grey / red) landed. Also dump the icon's CSS variable state
// (--icon-bg, --tint, --tint-soft) and the title / fileType for context.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const URL = 'http://localhost:3000/index.html';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function waitForDebugger(port, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const v = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      if (v.webSocketDebuggerUrl) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome debugger not ready');
}

async function run() {
  const userDataDir = path.join(__dirname, '.chrome-profile-icon-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--remote-debugging-port=9224',
      '--user-data-dir=' + userDataDir,
      '--hide-scrollbars',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  try {
    await waitForDebugger(9224);
    const v = await fetchJson(`http://127.0.0.1:9224/json/version`);
    const browserWs = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { browserWs.addEventListener('open', r); browserWs.addEventListener('error', j); });
    let bid = 1;
    const bpending = new Map();
    browserWs.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && bpending.has(msg.id)) {
        const { resolve, reject } = bpending.get(msg.id);
        bpending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    function bsend(method, params = {}) {
      const myId = bid++;
      browserWs.send(JSON.stringify({ id: myId, method, params }));
      return new Promise((resolve, reject) => { bpending.set(myId, { resolve, reject }); });
    }
    const { targetId } = await bsend('Target.createTarget', { url: URL });
    const { sessionId } = await bsend('Target.attachToTarget', { targetId, flatten: true });
    let id = 1;
    const pending = new Map();
    browserWs.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    function send(method, params = {}) {
      const myId = id++;
      browserWs.send(JSON.stringify({ id: myId, method, params, sessionId }));
      return new Promise((resolve, reject) => { pending.set(myId, { resolve, reject }); });
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: URL });
    await new Promise((r) => setTimeout(r, 2500));
    await send('Runtime.evaluate', { expression: `localStorage.setItem('olongnotes-theme','light')` });
    await send('Page.navigate', { url: URL });
    await new Promise((r) => setTimeout(r, 3000));

    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        document.querySelectorAll('.featured-card').forEach((card, i) => {
          const icon = card.querySelector('.featured-card__icon');
          const cs = icon ? getComputedStyle(icon) : null;
          const cardCs = getComputedStyle(card);
          out.push({
            index: i,
            title: (card.querySelector('.featured-card__title') || {}).textContent || '',
            fileType: card.dataset.fileType || '',
            iconBackground: cs ? cs.backgroundColor : null,
            iconVars: {
              iconBg: cardCs.getPropertyValue('--icon-bg').trim(),
              tint: cardCs.getPropertyValue('--tint').trim(),
              tintSoft: cardCs.getPropertyValue('--tint-soft').trim(),
            },
            topAccentColor: (() => {
              const bar = card.querySelector('.featured-card__top-accent, .featured-card__accent');
              return bar ? getComputedStyle(bar).backgroundColor : null;
            })(),
          });
        });
        return out;
      })()`,
      returnByValue: true,
    });

    console.log('[featured-card-icons]', JSON.stringify(result.result && result.result.value, null, 2));

    browserWs.close();
  } finally {
    chrome.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error('ERR', e); process.exit(1); });