// Tiny CDP probe: extract the href of the Browse Notes button and the
// Upload Notes button on the hero to confirm the routing fix.
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
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitForDebugger(port, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try { const v = await fetchJson(`http://127.0.0.1:${port}/json/version`); if (v.webSocketDebuggerUrl) return; }
    catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Chrome debugger not ready');
}

async function run() {
  const userDataDir = path.join(__dirname, '.chrome-profile-href-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9225',
     '--user-data-dir=' + userDataDir, '--hide-scrollbars'],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  try {
    await waitForDebugger(9225);
    const v = await fetchJson(`http://127.0.0.1:9225/json/version`);
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
    await send('Page.navigate', { url: URL });
    await new Promise((r) => setTimeout(r, 2500));

    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const browse = document.querySelector('.hero__actions a.btn--accent-blue, .hero__actions a.btn--lg.btn--accent-blue');
        const upload = document.querySelector('.hero__actions .btn--ghost');
        return {
          browseHref: browse ? (browse.getAttribute('href') || '') : null,
          browseText: browse ? (browse.textContent || '').trim() : null,
          uploadId: upload ? (upload.id || '') : null,
          uploadText: upload ? (upload.textContent || '').trim() : null,
        };
      })()`,
      returnByValue: true,
    });
    console.log('[hero-button-hrefs]', JSON.stringify(r.result.value, null, 2));

    browserWs.close();
  } finally {
    chrome.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error('ERR', e); process.exit(1); });