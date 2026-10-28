'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Translator = require('../js/instrument/translator.js');

function feed(state, events, db, now, midi) {
  return Translator.gateMic(events, { db, now, midi: midi == null ? null : midi }, state);
}

test('el ambiente estable no cuenta como nota', () => {
  let state = null;
  for (let i = 0; i < 40; i++) {
    const pack = feed(state, [
      { type: 'on', pitch: 'C3', midi: 48 },
      { type: 'on', pitch: 'G2', midi: 43 },
      { type: 'on', pitch: 'D3', midi: 50 },
      { type: 'on', pitch: 'C2', midi: 36 }
    ], -36 + (i % 3) - 1, i * 20, 48);
    state = pack.state;
    assert.strictEqual(pack.events.filter((e) => e.type === 'on').length, 0);
    assert.strictEqual(pack.live, false);
  }
});

test('un ataque real deja pasar agudos y una sola nota bajo C4', () => {
  let state = null;
  for (let i = 0; i < 12; i++) {
    const quiet = feed(state, [], -42, i * 20, null);
    state = quiet.state;
  }
  const hit = feed(state, [
    { type: 'on', pitch: 'C5', midi: 72 },
    { type: 'on', pitch: 'G2', midi: 43 },
    { type: 'on', pitch: 'C3', midi: 48 },
    { type: 'on', pitch: 'D3', midi: 50 }
  ], -16, 1000, 72);
  const ons = hit.events.filter((e) => e.type === 'on').map((e) => e.pitch);
  assert.deepStrictEqual(ons, ['C5', 'D3']);
  assert.strictEqual(hit.live, true);
  const spray = feed(hit.state, [
    { type: 'on', pitch: 'B2', midi: 47 },
    { type: 'on', pitch: 'A2', midi: 45 }
  ], -15, 1100, 47);
  assert.deepStrictEqual(spray.events.filter((e) => e.type === 'on'), []);
  assert.strictEqual(spray.live, false);
  const later = feed(spray.state, [
    { type: 'on', pitch: 'G3', midi: 55 }
  ], -16, 1500, 55);
  assert.deepStrictEqual(later.events.filter((e) => e.type === 'on').map((e) => e.pitch), ['G3']);
});

test('C4 no entra en el cerrojo de los graves y el silencio suelta', () => {
  let state = null;
  for (let i = 0; i < 10; i++) state = feed(state, [], -44, i * 20, null).state;
  const chord = feed(state, [
    { type: 'on', pitch: 'C4', midi: 60 },
    { type: 'on', pitch: 'E4', midi: 64 },
    { type: 'off', pitch: 'B3', midi: 59 }
  ], -18, 800, 60);
  assert.deepStrictEqual(chord.events.map((e) => e.pitch), ['C4', 'E4', 'B3']);
  const quietOff = feed(chord.state, [{ type: 'off', pitch: 'C4', midi: 60 }], -40, 820, null);
  assert.deepStrictEqual(quietOff.events.map((e) => e.type), ['off']);
});

test('la app filtra el micrófono antes de soltar las notas', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /InstrumentTranslator\.gateMic\(/);
  assert.match(app, /micGateState = null/);
  assert.match(app, /applyEngineEvents\(\{ events: gated\.events \}\)/);
});
