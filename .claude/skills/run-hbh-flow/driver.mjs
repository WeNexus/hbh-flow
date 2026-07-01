#!/usr/bin/env node
// CDP driver for hbh-flow. Drives the running web UI (served via the API
// origin on :3001, which proxies to the Vite dev server) using headless
// google-chrome over the DevTools Protocol. No puppeteer/playwright needed —
// it uses Node's built-in global WebSocket (Node 21+).
//
// Usage:
//   node driver.mjs shot  <url> <out.png>
//   node driver.mjs login <baseUrl> <email> <password> <out.png>
//
// Examples:
//   node driver.mjs shot  http://localhost:3001/ /tmp/shots/login.png
//   node driver.mjs login http://localhost:3001 flow@honeybeeherb.com hbh-admin-1234 /tmp/shots/dash.png
//
// Chrome is launched fresh on a private debug port and killed on exit.

import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';

const CHROME =
  process.env.CHROME_BIN ||
  ['google-chrome', 'chromium', 'chromium-browser'].find((b) => {
    try { execSync(`command -v ${b}`, { stdio: 'ignore' }); return true; }
    catch { return false; }
  });
if (!CHROME) { console.error('No chrome/chromium found (set CHROME_BIN)'); process.exit(1); }

const PORT = 9222 + Math.floor(Math.random() * 1000);
const USERDIR = fs.mkdtempSync('/tmp/hbh-chrome-');

function launchChrome() {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${USERDIR}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  return proc;
}

async function getWsUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

// Minimal CDP client over the built-in WebSocket.
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null;
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  // Attach to the first page target.
  const { targetInfos } = await cdp.send('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

// Poll a boolean JS expression until true (or timeout). React + the Vite dev
// server render lazily, so a fixed sleep races the first paint — poll instead.
async function waitFor(cdp, expression, { timeout = 20000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await evaluate(cdp, `!!(${expression})`)) return true; } catch { /* frame swapping */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function navigate(cdp, url, ready = 'document.body && document.body.innerText.trim().length > 0') {
  await cdp.send('Page.navigate', { url });
  await waitFor(cdp, ready, { label: 'page content' });
  await sleep(500); // brief settle after first meaningful paint
}

async function screenshot(cdp, out) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`screenshot → ${out} (${fs.statSync(out).size} bytes)`);
}

// Fill the two login inputs. React controlled inputs need the *native* value
// setter (to defeat React's value tracker) plus a bubbling 'input' event.
const REACT_FILL = (email, password) => `(() => {
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Prefer explicit ids (#email/#password) — selecting by type is fragile
  // because MUI's mode-select renders its own hidden input on the page.
  const inputs = [...document.querySelectorAll('input')];
  const email = document.querySelector('#email') || inputs.find(i => /email/i.test(i.placeholder||'') || i.type === 'email');
  const pass  = document.querySelector('#password') || inputs.find(i => i.type === 'password');
  if (!email || !pass) return 'inputs-not-found';
  setVal(email, ${JSON.stringify(email)});
  setVal(pass, ${JSON.stringify(password)});
  return 'filled';
})()`;

const CLICK_LOGIN = `(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /login|sign in/i.test(b.textContent||''));
  if (!btn) return 'button-not-found';
  btn.click();
  return 'clicked';
})()`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const chrome = launchChrome();
  let cdp;
  try {
    cdp = await connect(await getWsUrl());
    if (cmd === 'shot') {
      const [url, out] = args;
      await navigate(cdp, url);
      await screenshot(cdp, out);
    } else if (cmd === 'login') {
      const [base, email, password, out] = args;
      // Wait for the login form (two inputs) to actually render before typing.
      await navigate(cdp, base + '/', "document.querySelectorAll('input').length >= 2");
      const filled = await evaluate(cdp, REACT_FILL(email, password));
      console.log('fill:', filled);
      await sleep(500); // let React commit the controlled-input state before submit
      const clicked = await evaluate(cdp, CLICK_LOGIN);
      console.log('click:', clicked);
      // Wait until we've navigated away from /login (auth succeeded + redirect).
      try {
        await waitFor(cdp, "location.pathname !== '/login'", { label: 'redirect off /login', timeout: 15000 });
      } catch (e) {
        const alertText = await evaluate(cdp, "(document.querySelector('.MuiAlert-message')||{}).textContent || ''");
        console.error('login did not redirect. alert text:', JSON.stringify(alertText));
      }
      await sleep(1500); // let the post-login view render
      const path = await evaluate(cdp, 'location.pathname');
      console.log('after login → path:', path);
      await screenshot(cdp, out);
    } else if (cmd === 'probe') {
      // Debug: run login + whoami via the page's own fetch and report statuses.
      const [base, email, password] = args;
      await navigate(cdp, base + '/', "document.querySelectorAll('input').length >= 2");
      const out = await evaluate(cdp, `(async () => {
        const r1 = await fetch('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email:${JSON.stringify(email)}, password:${JSON.stringify(password)} }) });
        const j1 = await r1.json();
        const r2 = await fetch('/api/auth/whoami', { headers: { 'X-CSRF-Token': j1.csrfToken || '' } });
        const t2 = await r2.text();
        return JSON.stringify({ loginStatus: r1.status, csrf: !!j1.csrfToken, whoamiStatus: r2.status, whoami: t2.slice(0,200) });
      })()`);
      console.log('probe:', out);
    } else {
      console.error('unknown command:', cmd);
      process.exit(2);
    }
  } finally {
    try { chrome.kill('SIGKILL'); } catch {}
    fs.rmSync(USERDIR, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
