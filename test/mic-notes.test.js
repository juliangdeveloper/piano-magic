// test/mic-notes.test.js — hops, anti-eco del altavoz y fusión de fuentes.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Mic = require(path.join(__dirname, '..', 'js', 'instrument', 'mic-notes.js'));

test('dos hops de la misma nota abren; uno solo no', () => {
  const st = Mic.create();
  const a = Mic.hop(st, { midi: 60, name: 'C4' });
  assert.strictEqual(a.on, null);
  assert.strictEqual(a.off, null);
  const b = Mic.hop(st, { midi: 60, name: 'C4' });
  assert.strictEqual(b.on, 'C4');
  assert.strictEqual(b.off, null);
  const c = Mic.hop(st, { midi: 60, name: 'C4' });
  assert.strictEqual(c.on, null);
});

test('el silencio cierra tras el hueco y un cambio de nota reemplaza', () => {
  const st = Mic.create();
  Mic.hop(st, { midi: 60, name: 'C4' });
  Mic.hop(st, { midi: 60, name: 'C4' });
  Mic.hop(st, { midi: null, name: null });
  Mic.hop(st, { midi: null, name: null });
  const still = Mic.hop(st, { midi: null, name: null });
  assert.strictEqual(still.off, 'C4');
  Mic.hop(st, { midi: 62, name: 'D4' });
  const on = Mic.hop(st, { midi: 62, name: 'D4' });
  assert.strictEqual(on.on, 'D4');
  Mic.hop(st, { midi: 64, name: 'E4' });
  const swap = Mic.hop(st, { midi: 64, name: 'E4' });
  assert.strictEqual(swap.off, 'D4');
  assert.strictEqual(swap.on, 'E4');
});

test('accept filtra claridad, cents y el rango C3–C6', () => {
  assert.strictEqual(Mic.accept({ name: 'C', octave: 4, midi: 60, cents: 0 }, 0.9), 'C4');
  assert.strictEqual(Mic.accept({ name: 'C', octave: 4, midi: 60, cents: 0 }, 0.5), null);
  assert.strictEqual(Mic.accept({ name: 'C', octave: 4, midi: 60, cents: 41 }, 0.99), null);
  assert.strictEqual(Mic.accept({ name: 'C', octave: 2, midi: 36, cents: 0 }, 0.99), null);
  assert.strictEqual(Mic.accept({ name: 'C', octave: 7, midi: 96, cents: 0 }, 0.99), null);
  const quietHigh = Mic.accept({ name: 'C', octave: 5, midi: 72, cents: 3 }, 0.8);
  assert.strictEqual(quietHigh, 'C5');
});

test('el eco del altavoz bloquea fundamental, vecino y octava solo mientras dura', () => {
  const blocks = [{ midi: 60, until: 1000 }];
  assert.strictEqual(Mic.isBlocked(blocks, 60, 500), true);
  assert.strictEqual(Mic.isBlocked(blocks, 61, 500), true);
  assert.strictEqual(Mic.isBlocked(blocks, 72, 500), true);
  assert.strictEqual(Mic.isBlocked(blocks, 48, 500), true);
  assert.strictEqual(Mic.isBlocked(blocks, 64, 500), false);
  assert.strictEqual(Mic.isBlocked(blocks, 60, 1000), false);
  assert.strictEqual(Mic.isBlocked(blocks, 60, 1001), false);
});

test('OSK y mic no disparan dos veces el combate; el mic no suena', () => {
  const held = {};
  const osk = Mic.mergePress(held, 'C4', 'osk');
  assert.strictEqual(osk.fresh, true);
  assert.strictEqual(osk.combat, true);
  assert.strictEqual(osk.sound, true);
  const mic = Mic.mergePress(held, 'C4', 'mic');
  assert.strictEqual(mic.fresh, false);
  assert.strictEqual(mic.combat, false);
  assert.strictEqual(mic.sound, false);
  const again = Mic.mergePress(held, 'C4', 'osk');
  assert.strictEqual(again.added, false);
  assert.strictEqual(again.sound, false);
  assert.strictEqual(Mic.mergeRelease(held, 'C4', 'mic').released, false);
  assert.strictEqual(Mic.mergeRelease(held, 'C4', 'osk').released, true);
  assert.ok(!held.C4);
});

test('mensajes en español y la sesión de audio', () => {
  assert.match(Mic.denyMessage('NotAllowedError'), /denegado/);
  assert.match(Mic.denyMessage('NotFoundError'), /micrófono/i);
  assert.match(Mic.denyMessage('NotSupportedError'), /navegador/);
  assert.strictEqual(Mic.sessionType(false), 'playback');
  assert.strictEqual(Mic.sessionType(true), 'play-and-record');
  assert.match(Mic.statusLine({ ios: true }), /altavoz/);
  assert.match(Mic.statusLine({ ios: false }), /jefe/);
  assert.equal(/altavoz/.test(Mic.statusLine({ ios: false })), false);
});
