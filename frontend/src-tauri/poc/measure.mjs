// PoC o'lchov: bundled-frontend Windows qobig'ini ishga tushiradi va WebView2 ga CDP orqali ulanib vaqtni o'lchaydi.
// Ishlatish:  node frontend/src-tauri/poc/measure.mjs <exe yo'li> [takror=3]
// Hech qanday parol/token kiritilmaydi; faqat yuklanish vaqti va /api relay (sessiyasiz 401) tekshiriladi.
import { spawn } from 'node:child_process';

const exe = process.argv[2];
const runs = Number(process.argv[3] ?? 3);
const PORT = 9333;
if (!exe) { console.error('exe yo\'li kerak'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function targets() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { return []; }
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const ready = new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send, close: () => ws.close() };
}

async function once() {
  const spawnEpoch = Date.now();
  const p = spawn(exe, [], {
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  });
  let page;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !page) {
    page = (await targets()).find(t => t.type === 'page' && /tauri\.localhost|^tauri:/.test(t.url));
    if (!page) await sleep(50);
  }
  if (!page) { p.kill(); return { error: 'sahifa target topilmadi' }; }
  const targetAt = Date.now() - spawnEpoch;
  const c = cdp(page.webSocketDebuggerUrl); await c.ready;
  // FCP va "yuklandi" holatini kut
  let info;
  for (let i = 0; i < 200; i++) {
    const r = await c.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint');
      const res = performance.getEntriesByType('resource');
      return { origin: location.origin, path: location.pathname, tauri: !!window.__TAURI__, timeOrigin: performance.timeOrigin,
        fcp: fcp ? fcp.startTime : null, domContentLoaded: nav ? nav.domContentLoadedEventEnd : null, load: nav ? nav.loadEventEnd : null,
        resources: res.length, transferKB: Math.round(res.reduce((a, x) => a + (x.transferSize || 0), 0) / 1024),
        decodedKB: Math.round(res.reduce((a, x) => a + (x.decodedBodySize || 0), 0) / 1024),
        bodyText: (document.body && document.body.innerText || '').slice(0, 200), inputs: document.querySelectorAll('input').length };
    })()` });
    info = r.result?.result?.value;
    if (info && info.fcp && info.load && info.inputs > 0) break;
    await sleep(100);
  }
  // API relay: sessiyasiz so'rov serverga Rust orqali ketib 401 qaytishi kerak
  const relay = await c.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression:
    `(async () => { const t0 = performance.now(); try { const r = await fetch('/api/ish-joyi?bolim=joylarim'); const b = (await r.text()).slice(0, 120); return { status: r.status, ms: Math.round(performance.now() - t0), body: b }; } catch (e) { return { error: String(e) }; } })()` });
  const out = {
    spawnToTargetMs: targetAt,
    spawnToFcpMs: info?.fcp ? Math.round(info.timeOrigin + info.fcp - spawnEpoch) : null,
    spawnToLoginInputsMs: null,
    fcpMsFromNav: info?.fcp ? Math.round(info.fcp) : null,
    domContentLoadedMs: info?.domContentLoaded ? Math.round(info.domContentLoaded) : null,
    loadMs: info?.load ? Math.round(info.load) : null,
    resources: info?.resources, transferKB: info?.transferKB, decodedKB: info?.decodedKB,
    tauriBridge: info?.tauri, origin: info?.origin, path: info?.path, bodyText: info?.bodyText, inputs: info?.inputs,
    apiRelay: relay.result?.result?.value,
  };
  c.close(); p.kill();
  await sleep(2000); // WebView2 bolalari ota jarayon bilan birga yopilishini kut (boshqa ilovalarning WebView2 ga tegilmaydi)
  return out;
}

const all = [];
for (let i = 0; i < runs; i++) { const r = await once(); all.push(r); console.log(JSON.stringify({ run: i + 1, ...r })); }
const med = k => { const v = all.map(x => x[k]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
console.log(JSON.stringify({ median: { spawnToTargetMs: med('spawnToTargetMs'), spawnToFcpMs: med('spawnToFcpMs'), fcpMsFromNav: med('fcpMsFromNav'), loadMs: med('loadMs') } }));
