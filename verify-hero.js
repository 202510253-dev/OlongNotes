// Verify the hero polish: capture desktop + mobile screenshots of the
// homepage hero, plus computed-style readouts for the eyebrow, title,
// accent span, and the two hero buttons.
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

async function attach(port) {
  const list = await fetchJson(`http://127.0.0.1:${port}/json`);
  console.log('[targets]', list.map((t) => `${t.type}:${t.url}`).join('\n            '));
  const target = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:3000')) || list[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
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
    ws.send(JSON.stringify({ id: myId, method, params }));
    return new Promise((resolve, reject) => { pending.set(myId, { resolve, reject }); });
  }
  return { ws, send };
}

async function setViewport(send, w, h, dpr = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
}

async function navigate(send, url, waitMs = 2500) {
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, waitMs));
}

async function evaluate(send, expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) {
    console.log('[exception]', JSON.stringify(r.exceptionDetails, null, 2));
  }
  return r.result && r.result.value;
}

async function screenshot(send, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip });
  return Buffer.from(r.data, 'base64');
}

async function run() {
  const userDataDir = path.join(__dirname, '.chrome-profile-hero-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  const chrome = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--remote-debugging-port=9223',
      '--user-data-dir=' + userDataDir,
      '--hide-scrollbars',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  try {
    await waitForDebugger(9223);
    // Connect to the browser-level (no target) endpoint first to create a fresh page target
    const v = await fetchJson(`http://127.0.0.1:9223/json/version`);
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
    // Attach to the new target
    const { sessionId } = await bsend('Target.attachToTarget', { targetId, flatten: true });
    // Now build a session-scoped send using sessionId
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
    // Force light theme for screenshot parity with the guide image
    await send('Storage.setCookies', { cookies: [] });
    await navigate(send, URL, 1500);
    await evaluate(send, `(() => { try { localStorage.setItem('olongnotes-theme', 'light'); } catch(_) {} })()`);
    await navigate(send, URL, 2500);
    await new Promise((r) => setTimeout(r, 1500)); // let the page load

    const out = path.join(__dirname, 'hero-screens');
    fs.mkdirSync(out, { recursive: true });

    // === Desktop 1280 ===
    await setViewport(send, 1280, 800);
    await navigate(send, URL, 2500);

    // Capture full hero
    const heroClip = await evaluate(send, `(() => {
      const r = document.querySelector('.hero').getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
    })()`);
    console.log('[hero@1280]', heroClip);
    const hero1 = await screenshot(send, { x: 0, y: 0, width: heroClip.width, height: heroClip.height, scale: 1 });
    fs.writeFileSync(path.join(out, 'desktop-1280-hero.png'), hero1);

    // Computed styles
    const styles = await evaluate(send, `(() => {
      function info(sel, label) {
        const el = document.querySelector(sel);
        if (!el) return { label, missing: true };
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          label,
          text: (el.textContent || '').trim().slice(0, 80),
          x: r.x, y: r.y, w: r.width, h: r.height,
          fontSize: cs.fontSize,
          color: cs.color,
          background: cs.backgroundColor,
          borderRadius: cs.borderRadius,
        };
      }
      return [
        info('.hero__eyebrow', 'eyebrow'),
        info('.hero__title', 'title'),
        info('.hero__title-accent', 'accent'),
        info('.hero__subtitle', 'subtitle'),
        info('.hero__actions .btn--accent-blue', 'browseBtn'),
        info('.hero__actions .btn--ghost', 'uploadBtn'),
        info('.search-card', 'searchCard'),
      ];
    })()`);
    console.log('[styles@1280]');
    for (const s of (styles || [])) console.log(' ', JSON.stringify(s));

    // Full page screenshot
    const full = await screenshot(send, { x: 0, y: 0, width: 1280, height: 1800, scale: 1 });
    fs.writeFileSync(path.join(out, 'desktop-1280-full.png'), full);

    // === Mobile 375 ===
    await setViewport(send, 375, 812);
    await navigate(send, URL, 2500);

    const heroMobile = await screenshot(send, { x: 0, y: 0, width: 375, height: 1100, scale: 1 });
    fs.writeFileSync(path.join(out, 'mobile-375-full.png'), heroMobile);

    const mobileStyles = await evaluate(send, `(() => {
      function info(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent||'').trim().slice(0,40) };
      }
      return {
        eyebrow: info('.hero__eyebrow'),
        title: info('.hero__title'),
        accent: info('.hero__title-accent'),
        browse: info('.hero__actions .btn--accent-blue'),
        upload: info('.hero__actions .btn--ghost'),
        search: info('.search-card'),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        theme: document.documentElement.getAttribute('data-theme') || 'light',
      };
    })()`);
    console.log('[styles@375]', JSON.stringify(mobileStyles, null, 2));

    browserWs.close();
    console.log('done. screenshots in:', out);
  } finally {
    chrome.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((e) => { console.error('ERR', e); process.exit(1); });