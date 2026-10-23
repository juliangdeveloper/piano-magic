// test/levels.test.js — sonoridad del jefe frente al clic del metrónomo.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const BOSS_GAIN = 0.236;
const METRO_WEAK = 0.01545;
const ACCENT = 0.045 / 0.028;
const METRO_STRONG = METRO_WEAK * ACCENT;

function chromeBin() {
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (let d = 0; d < dirs.length; d++) {
    for (let n = 0; n < names.length; n++) {
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
    }, 30000);
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
      if (msg.error) {
        reject(new Error(JSON.stringify(msg.error)));
        return;
      }
      if (msg.result && msg.result.exceptionDetails) {
        reject(new Error('OfflineAudioContext: ' + JSON.stringify(msg.result.exceptionDetails).slice(0, 800)));
        return;
      }
      resolve(msg.result && msg.result.result && msg.result.result.value);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('no se pudo medir con OfflineAudioContext'));
    });
  });
}

async function measureLoudness() {
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
  const expr = `(async () => {
    const sr = 48000;
    const bossGain = ${BOSS_GAIN};
    const weakGain = ${METRO_WEAK};
    const strongGain = ${METRO_STRONG};
    function hz(name) {
      const pc = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
      const m = /^([A-G]#?)(-?\\d+)$/.exec(name);
      const midi = (parseInt(m[2], 10) + 1) * 12 + pc[m[1]];
      return 440 * Math.pow(2, (midi - 69) / 12);
    }
    function biquad(input, b0, b1, b2, a1, a2) {
      const out = new Float64Array(input.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < input.length; i++) {
        const x0 = input[i];
        const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        out[i] = y0;
        x2 = x1; x1 = x0; y2 = y1; y1 = y0;
      }
      return out;
    }
    function onePole(f, kind) {
      const K = Math.tan(Math.PI * f / sr);
      const n = 1 + K;
      if (kind === 'hp') return [1 / n, -1 / n, 0, (K - 1) / n, 0];
      return [K / n, K / n, 0, (K - 1) / n, 0];
    }
    const aStages = [];
    const spec = [20.598997, 'hp', 20.598997, 'hp', 107.65265, 'hp', 737.86223, 'hp', 12194.217, 'lp', 12194.217, 'lp'];
    for (let i = 0; i < spec.length; i += 2) aStages.push(onePole(spec[i], spec[i + 1]));
    let aNorm = 1;
    {
      const n = sr;
      const probe = new Float64Array(n);
      for (let i = 0; i < n; i++) probe[i] = Math.sin(2 * Math.PI * 1000 * i / sr);
      let y = probe;
      for (let s = 0; s < aStages.length; s++) {
        const c = aStages[s];
        y = biquad(y, c[0], c[1], c[2], c[3], c[4]);
      }
      let sum = 0;
      const start = n >> 2;
      for (let i = start; i < n; i++) sum += y[i] * y[i];
      aNorm = Math.sqrt(sum / (n - start)) / Math.SQRT1_2;
    }
    function aWeight(data) {
      let y = data;
      for (let s = 0; s < aStages.length; s++) {
        const c = aStages[s];
        y = biquad(y, c[0], c[1], c[2], c[3], c[4]);
      }
      for (let i = 0; i < y.length; i++) y[i] /= aNorm;
      return y;
    }
    function erb(f) { return 24.7 * (4.37 * f / 1000 + 1); }
    const centers = [];
    for (let f = 80; f < 10000; f += erb(f)) centers.push(f);
    const bps = centers.map((f) => {
      const w0 = 2 * Math.PI * f / sr;
      const alpha = Math.sin(w0) / (2 * (f / erb(f)));
      const a0 = 1 + alpha;
      return [alpha / a0, 0, -alpha / a0, -2 * Math.cos(w0) / a0, (1 - alpha) / a0];
    });
    function loudness(filtered, n) {
      let best = 0;
      const levels = new Float64Array(bps.length);
      for (let b = 0; b < bps.length; b++) {
        const c = bps[b];
        const y = biquad(filtered, c[0], c[1], c[2], c[3], c[4]);
        let s = 0;
        for (let i = 0; i < n; i++) s += y[i] * y[i];
        const r = Math.sqrt(s / n);
        levels[b] = r;
        if (r > best) best = r;
      }
      const cut = best * Math.pow(10, -30 / 20);
      let N = 0;
      for (let b = 0; b < levels.length; b++) {
        if (levels[b] >= cut) N += Math.pow(levels[b], 0.6);
      }
      return N;
    }
    function stats(data, n) {
      let s = 0;
      let pk = 0;
      for (let i = 0; i < n; i++) {
        s += data[i] * data[i];
        const a = Math.abs(data[i]);
        if (a > pk) pk = a;
      }
      return { rms: Math.sqrt(s / n), peak: pk };
    }
    async function render(opts) {
      const dur = opts.dur;
      const length = Math.ceil(sr * (dur + 0.03));
      const ctx = new OfflineAudioContext(1, length, sr);
      const master = ctx.createGain();
      master.gain.value = 0.92;
      master.connect(ctx.destination);
      const parts = opts.parts || [opts];
      for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const gain = part.gain;
        const pdur = part.dur;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(gain * 0.7, 0);
        amp.gain.linearRampToValueAtTime(gain, 0.005);
        amp.gain.linearRampToValueAtTime(gain * 0.5, Math.max(0.04, pdur * 0.4));
        amp.gain.linearRampToValueAtTime(0.0001, pdur);
        amp.connect(master);
        const osc = ctx.createOscillator();
        osc.type = part.type;
        osc.frequency.setValueAtTime(part.freq, 0);
        osc.connect(amp);
        osc.start(0);
        osc.stop(pdur + 0.02);
        if (part.overtone) {
          const over = ctx.createOscillator();
          const og = ctx.createGain();
          over.type = 'sine';
          over.frequency.setValueAtTime(part.freq * 2, 0);
          og.gain.setValueAtTime(part.overtone, 0);
          over.connect(og);
          og.connect(amp);
          over.start(0);
          over.stop(pdur + 0.02);
        }
      }
      const buf = await ctx.startRendering();
      const raw = new Float64Array(buf.getChannelData(0));
      const n = Math.min(raw.length, Math.floor(sr * dur));
      const aw = aWeight(raw);
      const rawS = stats(raw, n);
      const aS = stats(aw, n);
      return { peak: rawS.peak, aRms: aS.rms, N: loudness(aw, n) };
    }
    const pitches = ['G3', 'C4', 'G4', 'D5'];
    const jobs = [];
    for (let i = 0; i < pitches.length; i++) {
      const freq = hz(pitches[i]);
      jobs.push({ name: 'old-' + pitches[i], freq: freq, gain: 0.13, dur: 0.48, type: 'sine' });
      jobs.push({ name: 'new-' + pitches[i], freq: freq, gain: bossGain, dur: 0.48, type: 'sine' });
    }
    jobs.push({ name: 'old-weak', freq: 880, gain: 0.028, dur: 0.04, type: 'square' });
    jobs.push({ name: 'new-weak', freq: 880, gain: weakGain, dur: 0.04, type: 'square' });
    jobs.push({ name: 'old-strong', freq: 1320, gain: 0.045, dur: 0.04, type: 'square' });
    jobs.push({ name: 'new-strong', freq: 1320, gain: strongGain, dur: 0.04, type: 'square' });
    jobs.push({ name: 'player', freq: hz('C4'), gain: 0.32, dur: 0.42, type: 'triangle', overtone: 0.18 });
    jobs.push({
      name: 'mix',
      dur: 0.48,
      parts: [
        { freq: hz('G4'), gain: bossGain, dur: 0.48, type: 'sine' },
        { freq: 1320, gain: strongGain, dur: 0.04, type: 'square' },
        { freq: hz('C4'), gain: 0.32, dur: 0.42, type: 'triangle', overtone: 0.18 }
      ]
    });
    const voices = {};
    for (let i = 0; i < jobs.length; i++) voices[jobs[i].name] = await render(jobs[i]);
    return voices;
  })()`;
  try {
    const page = await waitPage(port);
    return await cdpEvaluate(page.webSocketDebuggerUrl, expr);
  } finally {
    chrome.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function meanOf(voices, prefix, pitches) {
  let sum = 0;
  for (let i = 0; i < pitches.length; i++) sum += voices[prefix + pitches[i]].N;
  return sum / pitches.length;
}

test('L1: el jefe suena más fuerte que el clic, con la sonoridad de 0.1.27 intercambiada', async () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /gain: strong \? \(0\.01545 \* 0\.045 \/ 0\.028\) : 0\.01545/);
  assert.match(app, /role: 'boss',\s*gain: 0\.236/);
  assert.match(app, /type: 'sine'/);
  assert.match(app, /overtone: false/);
  assert.equal(/gain: strong \? 0\.045 : 0\.028/.test(app), false);
  assert.equal(/role: 'boss',\s*gain: 0\.13/.test(app), false);
  assert.equal(/role: 'boss',\s*gain: 0\.028/.test(app), false);
  assert.match(app, /var peak = opts\.gain == null \? 0\.32 : opts\.gain/);
  assert.match(app, /og\.gain\.setValueAtTime\(0\.18, t0\)/);
  assert.match(app, /masterGain\.gain\.value = 0\.92/);
  assert.match(app, /if \(merged\.sound && !opts\.silent\) playPitch\(name\)/);
  assert.ok(Math.abs((METRO_STRONG / METRO_WEAK) - ACCENT) < 1e-12);

  if (!chromeBin()) return;
  const voices = await measureLoudness();
  const pitches = ['G3', 'C4', 'G4', 'D5'];
  const oldEnemy = meanOf(voices, 'old-', pitches);
  const newEnemy = meanOf(voices, 'new-', pitches);
  const oldWeak = voices['old-weak'].N;
  const newWeak = voices['new-weak'].N;
  assert.ok(newEnemy > newWeak * 1.25, 'jefe ' + newEnemy + ' clic ' + newWeak);
  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] === 'G3') continue;
    assert.ok(voices['new-' + pitches[i]].N > newWeak, pitches[i]);
  }
  assert.ok(Math.abs(newEnemy - oldWeak) / oldWeak < 0.08, newEnemy + ' vs ' + oldWeak);
  assert.ok(Math.abs(newWeak - oldEnemy) / oldEnemy < 0.08, newWeak + ' vs ' + oldEnemy);
  const oldAccent = voices['old-strong'].N / oldWeak;
  const newAccent = voices['new-strong'].N / newWeak;
  assert.ok(Math.abs(newAccent - oldAccent) / oldAccent < 0.08, newAccent + ' vs ' + oldAccent);
  assert.ok(voices.player.peak > 0.27 && voices.player.peak < 0.32);
  assert.ok(voices.mix.peak < 1, 'pico de la mezcla ' + voices.mix.peak);
});
