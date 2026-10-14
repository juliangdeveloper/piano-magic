// Bench: tonos sintéticos tipo piano C3..C6 por el mismo camino que micTick.
'use strict';
var Pitch = require('../js/pitch.js');
var MicNotes = require('../js/instrument/mic-notes.js');
var NOISE = +(process.env.NOISE || 0.03);
var SR = 48000, N = 2048, HOP = Math.round(SR * MicNotes.HOP_MS / 1000);
function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function tone(midi, amp, seed) {
  var r = rng(seed), f0 = 440 * Math.pow(2, (midi - 69) / 12), len = Math.round(SR * 0.9);
  var B = 0.0004 * Math.pow(2, (midi - 48) / 12) * 0.5; // inarmonicidad
  var PRE = Math.round(SR * 0.5); len += PRE;
  var out = new Float32Array(len), H = Math.min(16, Math.floor(8000 / f0));
  for (var h = 1; h <= H; h++) {
    // graves: fundamental débil, 2º/3º armónico dominantes (altavoz de celular)
    var fund = midi < 60 ? 0.12 : midi < 72 ? 0.3 : 0.8;
    var w = h === 1 ? fund : h === 2 ? 1 : h === 3 ? 0.9 : h === 4 ? 0.6 : 0.8 / h;
    var fh = h * f0 * Math.sqrt(1 + B * h * h), ph = r() * 6.28, dec = 2.5 + h * 0.8;
    if (fh > SR / 2.2) break;
    for (var i = 0; i < len - PRE; i++) out[i + PRE] += w * Math.sin(6.2832 * fh * i / SR + ph) * Math.exp(-dec * i / SR);
  }
  var pk = 0; for (var j = 0; j < len; j++) pk = Math.max(pk, Math.abs(out[j]));
  for (var k = 0; k < len; k++) out[k] = out[k] / pk * amp * Math.min(1, Math.max(0, k - PRE) / 200) + (r() - 0.5) * NOISE + 0.01 * Math.sin(6.2832 * 120 * k / SR);
  return out;
}
function run(midi, amp, seed) {
  var x = tone(midi, amp, seed), st = MicNotes.create(), ons = [];
  for (var p = N; p <= x.length; p += HOP) {
    var buf = x.subarray(p - N, p), name = null, m = null;
    var obs = MicNotes.observe ? MicNotes.observe(st, buf, SR, Pitch) : null;
    if (obs) { name = obs.name; m = obs.midi; }
    else if (MicNotes.rmsDb(buf) >= MicNotes.GATE_DB) {
      var res = Pitch.detectPitch(buf, SR, { maxLag: 420 });
      if (res && res.freq) { var note = Pitch.noteFromFreq(res.freq, 440); name = MicNotes.accept(note, res.clarity); if (name) m = note.midi; }
    }
    var ev = MicNotes.hop(st, { midi: name ? m : null, name: name });
    if (ev.on) ons.push(m);
  }
  return ons;
}
if (require.main !== module) { module.exports = { tone: tone, SR: SR, N: N, HOP: HOP, run: run }; return; }
var bands = [[48, 59, 'C3-B3'], [60, 71, 'C4-B4'], [72, 79, 'C5-G5'], [80, 84, 'G#5-C6']];
var amps = [0.02, 0.06, 0.2, 0.6];
console.log('ruido ' + NOISE + ' · columnas = volumen pico; celda = acierto% / con notas falsas%');
bands.forEach(function (b) {
  var row = [];
  amps.forEach(function (a, ai) {
    var ok = 0, bad = 0, tot = 0;
    for (var m = b[0]; m <= b[1]; m++) {
      var ons = run(m, a, m * 7 + ai + 1); tot++;
      if (ons[0] === m) ok++;
      if (ons.some(function (o) { return o !== m; })) bad++;
    }
    row.push(a + ': ' + Math.round(100 * ok / tot) + '/' + Math.round(100 * bad / tot));
  });
  console.log(b[2] + '  ' + row.join('  '));
});
if (process.env.V) for (var m = 48; m <= 84; m += 3) console.log(m, amps.map(function (a, ai) { return JSON.stringify(run(m, a, m * 7 + ai + 1)); }).join(' '));
