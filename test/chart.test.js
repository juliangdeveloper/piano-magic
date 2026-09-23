// test/chart.test.js — carga y timeline del chart Raindrops, Thunder.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));

const CHART_PATH = path.join(__dirname, '..', 'charts', 'raindrops-thunder.json');

function load() {
  return Chart.parse(JSON.parse(fs.readFileSync(CHART_PATH, 'utf8')));
}

test('C1: raindrops-thunder.json parsea con HP 15/20, BPM 60, sala C', () => {
  const c = load();
  assert.strictEqual(c.id, 'raindrops-thunder');
  assert.strictEqual(c.title, 'Raindrops, Thunder');
  assert.strictEqual(c.bpm, 60);
  assert.deepStrictEqual(c.timeSig, [4, 4]);
  assert.strictEqual(c.roomKey, 'C');
  assert.strictEqual(c.hp.player, 15);
  assert.strictEqual(c.hp.boss, 20);
  assert.strictEqual(c.setup.listenOnly, true);
  assert.strictEqual(c.setup.bars, 1);
});

test('C2: loop es 1 hole + 4 defend (agujero primero)', () => {
  const c = load();
  assert.strictEqual(c.loop.length, 5);
  assert.deepStrictEqual(c.loop.map((b) => b.kind), ['hole', 'defend', 'defend', 'defend', 'defend']);
  assert.strictEqual(c.loop[0].notes.length, 0);
  assert.strictEqual(c.loop[1].notes.length, 4);
  assert.strictEqual(c.loop[1].notes[0].pitch, 'C4');
});

test('C3: beatsPerBar 4/4 → 4', () => {
  assert.strictEqual(Chart.beatsPerBar(load()), 4);
});

test('C4: bar 0 = setup; bar 1 hole; bars 2–5 defend; bar 6 vuelve al hole', () => {
  const c = load();
  const b0 = Chart.barAt(c, 0);
  assert.strictEqual(b0.kind, 'setup');
  assert.strictEqual(b0.listenOnly, true);
  assert.strictEqual(b0.startBeat, 0);

  const b1 = Chart.barAt(c, 1);
  assert.strictEqual(b1.kind, 'hole');
  assert.strictEqual(b1.i, 0);
  assert.strictEqual(b1.startBeat, 4);

  const b2 = Chart.barAt(c, 2);
  assert.strictEqual(b2.kind, 'defend');
  assert.strictEqual(b2.i, 1);
  assert.strictEqual(b2.notes[0].pitch, 'C4');

  const b5 = Chart.barAt(c, 5);
  assert.strictEqual(b5.kind, 'defend');
  assert.strictEqual(b5.i, 4);

  const b6 = Chart.barAt(c, 6);
  assert.strictEqual(b6.kind, 'hole');
  assert.strictEqual(b6.i, 0);
  assert.strictEqual(b6.cycle, 1);
  assert.strictEqual(b6.startBeat, 24);
});

test('C5: upcoming desde 0 devuelve setup + hole + primeros 2 defend', () => {
  const c = load();
  const u = Chart.upcoming(c, 0, 4);
  assert.deepStrictEqual(u.map((b) => b.kind), ['setup', 'hole', 'defend', 'defend']);
});

test('C6: chart inválido lanza ChartError', () => {
  assert.throws(() => Chart.parse({}), /falta id/);
  assert.throws(() => Chart.parse({ id: 'x', title: 't', bpm: 0, timeSig: [4, 4], roomKey: 'C', loop: [{ kind: 'defend', notes: [] }], hp: { player: 15, boss: 20 } }), /bpm/);
  assert.throws(() => Chart.parse(null), /vacío/);
});

test('C7: notas del segundo defend son C D E E', () => {
  const c = load();
  const pitches = c.loop[2].notes.map((n) => n.pitch);
  assert.deepStrictEqual(pitches, ['C4', 'D4', 'E4', 'E4']);
  const beats = c.loop[2].notes.map((n) => n.beat);
  assert.deepStrictEqual(beats, [0, 1, 2, 3]);
});

test('C8: el centro del tiempo es continuo al cruzar Ataque → Defiende', () => {
  assert.strictEqual(Chart.BEAT_CENTER, 0.5);
  assert.strictEqual(Chart.hitOnset(0), 0.5);
  assert.strictEqual(Chart.hitOnset(3), 3.5);
  assert.strictEqual(Chart.centerReached(7.49), 6);
  assert.strictEqual(Chart.centerReached(7.5), 7);
  assert.strictEqual(Chart.centerReached(8), 7);
  assert.strictEqual(Chart.centerReached(8.5), 8);
  assert.strictEqual(Chart.centerReached(8.5) - Chart.centerReached(7.5), 1);
});
