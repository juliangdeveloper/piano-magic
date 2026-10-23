// test/levels.test.js — el jefe y el metrónomo intercambian el nivel renderizado.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const MASTER = 0.92;
const OLD_BOSS = 0.13;
const OLD_WEAK = 0.028;
const OLD_STRONG = 0.045;
const NEW_BOSS = OLD_WEAK;
const NEW_WEAK = OLD_BOSS;
const NEW_STRONG = NEW_WEAK * OLD_STRONG / OLD_WEAK;

function envelope(gain, dur, t) {
  const half = Math.max(0.04, dur * 0.4);
  if (t <= 0.005) return gain * (0.7 + 0.3 * (t / 0.005));
  if (t <= half) return gain + (gain * 0.5 - gain) * ((t - 0.005) / (half - 0.005));
  return gain * 0.5 + (0.0001 - gain * 0.5) * ((t - half) / (dur - half));
}

function osc(type, freq, t) {
  const phase = (freq * t) % 1;
  if (type === 'square') return phase < 0.5 ? 1 : -1;
  if (type === 'triangle') {
    return phase < 0.5 ? -1 + 4 * phase : 3 - 4 * phase;
  }
  return Math.sin(2 * Math.PI * phase);
}

function render(opts) {
  const sr = 48000;
  const n = Math.floor(sr * opts.dur);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let y = osc(opts.type, opts.freq, t);
    if (opts.overtone) y += 0.18 * Math.sin(2 * Math.PI * opts.freq * 2 * t);
    y *= envelope(opts.gain, opts.dur, t) * MASTER;
    const a = Math.abs(y);
    if (a > peak) peak = a;
    sum += y * y;
  }
  return { peak, rms: Math.sqrt(sum / n) };
}

function near(actual, expected, tol, label) {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(err < tol, label + ': ' + actual + ' vs ' + expected + ' (' + err + ')');
}

function chromeBin() {
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  let d;
  let n;
  for (d = 0; d < dirs.length; d++) {
    for (n = 0; n < names.length; n++) {
      const full = path.join(dirs[d], names[n]);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitPage(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      if (res.ok) {
        const list = await res.json();
        const page = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (e) {}
    await sleep(80);
  }
  throw new Error('sin puerto de depuración');
}

function cdpEvaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      reject(new Error('tiempo de espera del audio'));
    }, 20000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || msg.id !== 1) return;
      clearTimeout(timer);
      try { ws.close(); } catch (e2) {}
      if (msg.result && msg.result.exceptionDetails) {
        reject(new Error('OfflineAudioContext: ' + JSON.stringify(msg.result.exceptionDetails)));
        return;
      }
      const value = msg.result && msg.result.result && msg.result.result.value;
      if (!value || !value.newBoss) {
        const brief = JSON.stringify(msg).slice(0, 800);
        reject(new Error('respuesta de audio: ' + brief));
        return;
      }
      resolve(value);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('no se pudo medir con OfflineAudioContext'));
    });
  });
}

async function measureOffline(voices) {
  const bin = chromeBin();
  if (!bin) return null;
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-audio-'));
  const chrome = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir,
    'about:blank'
  ], { stdio: 'ignore' });
  try {
    const page = await waitPage(port);
    const expr = `(async () => {
      const voices = ${JSON.stringify(voices)};
      async function render(opts) {
        const sr = 48000;
        const dur = opts.dur;
        const length = Math.ceil(sr * (dur + 0.05));
        const ctx = new OfflineAudioContext(1, length, sr);
        const master = ctx.createGain();
        master.gain.value = ${MASTER};
        master.connect(ctx.destination);
        const peak = opts.gain;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(peak * 0.7, 0);
        amp.gain.linearRampToValueAtTime(peak, 0.005);
        amp.gain.linearRampToValueAtTime(peak * 0.5, Math.max(0.04, dur * 0.4));
        amp.gain.linearRampToValueAtTime(0.0001, dur);
        amp.connect(master);
        const osc = ctx.createOscillator();
        osc.type = opts.type;
        osc.frequency.setValueAtTime(opts.freq, 0);
        osc.connect(amp);
        osc.start(0);
        osc.stop(dur + 0.02);
        if (opts.overtone) {
          const over = ctx.createOscillator();
          const og = ctx.createGain();
          over.type = 'sine';
          over.frequency.setValueAtTime(opts.freq * 2, 0);
          og.gain.setValueAtTime(0.18, 0);
          over.connect(og);
          og.connect(amp);
          over.start(0);
          over.stop(dur + 0.02);
        }
        const buf = await ctx.startRendering();
        const data = buf.getChannelData(0);
        const n = Math.min(data.length, Math.floor(sr * dur));
        let pk = 0;
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const a = Math.abs(data[i]);
          if (a > pk) pk = a;
          sum += data[i] * data[i];
        }
        return { peak: pk, rms: Math.sqrt(sum / n) };
      }
      const out = {};
      for (const v of voices) out[v.name] = await render(v);
      return out;
    })()`;
    return await cdpEvaluate(page.webSocketDebuggerUrl, expr);
  } finally {
    chrome.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('L1: el jefe toma el nivel del metrónomo y el clic el del jefe', async () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /gain: strong \? \(0\.13 \* 0\.045 \/ 0\.028\) : 0\.13/);
  assert.match(app, /role: 'boss',\s*gain: 0\.028/);
  assert.equal(/gain: strong \? 0\.045 : 0\.028/.test(app), false);
  assert.equal(/role: 'boss',\s*gain: 0\.13/.test(app), false);
  assert.match(app, /var peak = opts\.gain == null \? 0\.32 : opts\.gain/);
  assert.match(app, /og\.gain\.setValueAtTime\(0\.18, t0\)/);
  assert.match(app, /masterGain\.gain\.value = 0\.92/);
  assert.match(app, /if \(merged\.sound && !opts\.silent\) playPitch\(name\)/);

  const oldBoss = render({ type: 'sine', freq: 392, gain: OLD_BOSS, dur: 0.48 });
  const oldWeak = render({ type: 'square', freq: 880, gain: OLD_WEAK, dur: 0.04 });
  const oldStrong = render({ type: 'square', freq: 1320, gain: OLD_STRONG, dur: 0.04 });
  const newBoss = render({ type: 'sine', freq: 392, gain: NEW_BOSS, dur: 0.48 });
  const newWeak = render({ type: 'square', freq: 880, gain: NEW_WEAK, dur: 0.04 });
  const newStrong = render({ type: 'square', freq: 1320, gain: NEW_STRONG, dur: 0.04 });
  const player = render({ type: 'triangle', freq: 261.63, gain: 0.32, dur: 0.42, overtone: true });

  near(newBoss.peak, oldWeak.peak, 0.02, 'pico jefe');
  near(newWeak.peak, oldBoss.peak, 0.02, 'pico metrónomo');
  near(newStrong.peak / newWeak.peak, oldStrong.peak / oldWeak.peak, 0.001, 'razón del acento');
  near(newBoss.peak, NEW_BOSS * MASTER, 0.01, 'pico jefe × master');
  near(newWeak.peak, NEW_WEAK * MASTER, 0.01, 'pico clic × master');
  near(newStrong.peak, NEW_STRONG * MASTER, 0.01, 'pico acento × master');
  assert.ok(player.peak > newWeak.peak * 0.9);

  const bin = chromeBin();
  if (!bin) return;
  const live = await measureOffline([
    { name: 'oldBoss', type: 'sine', freq: 392, gain: OLD_BOSS, dur: 0.48 },
    { name: 'oldWeak', type: 'square', freq: 880, gain: OLD_WEAK, dur: 0.04 },
    { name: 'oldStrong', type: 'square', freq: 1320, gain: OLD_STRONG, dur: 0.04 },
    { name: 'newBoss', type: 'sine', freq: 392, gain: NEW_BOSS, dur: 0.48 },
    { name: 'newWeak', type: 'square', freq: 880, gain: NEW_WEAK, dur: 0.04 },
    { name: 'newStrong', type: 'square', freq: 1320, gain: NEW_STRONG, dur: 0.04 },
    { name: 'player', type: 'triangle', freq: 261.63, gain: 0.32, dur: 0.42, overtone: true }
  ]);
  near(live.newBoss.peak, live.oldWeak.peak, 0.05, 'OfflineAudioContext pico jefe');
  near(live.newWeak.peak, live.oldBoss.peak, 0.05, 'OfflineAudioContext pico metrónomo');
  near(
    live.newStrong.peak / live.newWeak.peak,
    live.oldStrong.peak / live.oldWeak.peak,
    0.02,
    'OfflineAudioContext razón del acento'
  );
  assert.ok(live.player.peak > live.newBoss.peak);
  assert.ok(live.player.rms > live.newBoss.rms * 0.5);
});
