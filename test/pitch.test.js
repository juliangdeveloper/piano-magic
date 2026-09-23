// test/pitch.test.js — YIN vendored (piano-game) sobre senos sintéticos.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Pitch = require(path.join(__dirname, '..', 'js', 'pitch.js'));

function sine(freq, sampleRate, n) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  return buf;
}

test('YIN: seno 440 Hz es A4 con claridad alta', () => {
  const res = Pitch.detectPitch(sine(440, 48000, 4096), 48000);
  assert.ok(res.freq != null);
  assert.ok(Math.abs(res.freq - 440) <= 1.5, 'freq=' + res.freq);
  assert.ok(res.clarity > 0.9, 'clarity=' + res.clarity);
  const note = Pitch.noteFromFreq(res.freq);
  assert.strictEqual(note.name, 'A');
  assert.strictEqual(note.octave, 4);
  assert.ok(Math.abs(note.cents) <= 2);
});

test('YIN: silencio y buffer corto no inventan un tono', () => {
  const silent = Pitch.detectPitch(new Float32Array(4096), 48000);
  assert.strictEqual(silent.freq, null);
  const short = Pitch.detectPitch(sine(440, 48000, 100), 48000);
  assert.strictEqual(short.freq, null);
});

test('YIN: C4 y el tope de lag no rompen el contrato', () => {
  const res = Pitch.detectPitch(sine(261.6256, 44100, 4096), 44100, { maxLag: 420 });
  assert.ok(res.freq != null);
  assert.ok(Math.abs(res.freq - 261.6256) <= 2, 'freq=' + res.freq);
  const note = Pitch.noteFromFreq(res.freq);
  assert.strictEqual(note.name, 'C');
  assert.strictEqual(note.octave, 4);
});
