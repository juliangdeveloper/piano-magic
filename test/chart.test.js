'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));

const CHART_PATH = path.join(__dirname, '..', 'charts', 'parade-feather.json');

function load(id) {
  const file = id ? path.join(__dirname, '..', 'charts', id + '.json') : CHART_PATH;
  return Chart.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function raw(id) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charts', id + '.json'), 'utf8'));
}

test('C1: parade-feather.json parsea con el HP del jugador en el override, jefe 20, BPM 72, sala C', () => {
  const file = raw('parade-feather');
  assert.strictEqual(file.hp.player, 15);
  assert.strictEqual(file.hp.boss, 20);
  const c = load();
  assert.strictEqual(c.id, 'parade-feather');
  assert.strictEqual(c.title, 'Parade Feather');
  assert.strictEqual(c.bpm, 72);
  assert.deepStrictEqual(c.timeSig, [4, 4]);
  assert.strictEqual(c.roomKey, 'C');
  assert.strictEqual(Chart.PLAYER_HP, 1000);
  assert.strictEqual(c.hp.player, Chart.PLAYER_HP);
  assert.strictEqual(c.hp.boss, 20);
  assert.strictEqual(c.setup.listenOnly, true);
  assert.strictEqual(c.setup.bars, 1);
});

test('C2: loop es grupos de hole + 4 defend, y el compás 8 son dos blancas', () => {
  const c = load();
  assert.strictEqual(c.loop.length, 10);
  assert.deepStrictEqual(c.loop.slice(0, 5).map((b) => b.kind), ['hole', 'defend', 'defend', 'defend', 'defend']);
  assert.strictEqual(c.loop[0].notes.length, 0);
  assert.strictEqual(c.loop[1].notes[0].pitch, 'C4');
  const last = c.loop[9].notes.filter((n) => n.hand === 'R').map((n) => [n.pitch, n.beat, n.dur, n.hand]);
  assert.deepStrictEqual(last, [['C4', 0, 2, 'R'], ['C4', 2, 2, 'R']]);
  assert.deepStrictEqual(c.loop[9].notes.filter((n) => n.hand === 'L'), []);
});

test('C3: beatsPerBar 4/4 → 4', () => {
  assert.strictEqual(Chart.beatsPerBar(load()), 4);
});

test('C4: bar 0 = setup; bar 1 hole; el ciclo vuelve al hole', () => {
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

  const b11 = Chart.barAt(c, 11);
  assert.strictEqual(b11.kind, 'hole');
  assert.strictEqual(b11.loopIndex, 0);
  assert.strictEqual(b11.cycle, 1);
  assert.strictEqual(b11.startBeat, 44);
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

test('C7: el segundo defend es C E D blanca en la derecha, sin bajo', () => {
  const c = load();
  const rh = c.loop[2].notes.filter((n) => n.hand === 'R').map((n) => [n.pitch, n.beat, n.dur, n.hand]);
  assert.deepStrictEqual(rh, [
    ['C4', 0, 1, 'R'],
    ['E4', 1, 1, 'R'],
    ['D4', 2, 2, 'R']
  ]);
  assert.deepStrictEqual(c.loop[2].notes.filter((n) => n.hand === 'L'), []);
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

test('C9: una nota sin mano no carga, y L/l se conservan', () => {
  const base = raw('parade-feather');
  base.loop[1].notes[1].hand = 'L';
  base.loop[1].notes[2].hand = 'l';
  const again = Chart.parse(base);
  assert.strictEqual(again.loop[1].notes[1].hand, 'L');
  assert.strictEqual(again.loop[1].notes[2].hand, 'L');
  const missing = raw('parade-feather');
  delete missing.loop[1].notes[0].hand;
  assert.throws(() => Chart.parse(missing), /sin mano/);
  const bad = raw('parade-feather');
  bad.loop[1].notes[0].hand = 'X';
  assert.throws(() => Chart.parse(bad), /sin mano/);
});

const shape = (bar) => bar.notes.map((n) => [n.pitch, n.beat, n.dur, n.hand, n.finger || 0]);

test('C10: Veil Boat en 3/4 empieza en la izquierda y toca dos veces sus 7 compases', () => {
  const c = load('veil-boat');
  assert.deepStrictEqual(c.timeSig, [3, 4]);
  assert.strictEqual(Chart.beatsPerBar(c), 3);
  assert.strictEqual(c.roomKey, 'C');
  const holes = c.loop.map((b, i) => (b.kind === 'hole' ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(holes, [0, 8]);
  const first = c.loop.slice(1, 8).map(shape);
  const second = c.loop.slice(9, 16).map(shape);
  assert.strictEqual(first.length, 7);
  assert.deepStrictEqual(second, first);
  assert.deepStrictEqual(first[0], [['G3', 0, 3, 'L', 3]]);
  assert.deepStrictEqual(first[5], [['B3', 0, 2, 'L', 1], ['C4', 2, 1, 'R', 1]]);
  assert.deepStrictEqual(first[6], [['D4', 0, 3, 'R', 0]]);
});

test('C11: Tower Chime en Do, 8 compases, pausa y campanada C3 de la izquierda', () => {
  const c = load('tower-chime');
  assert.deepStrictEqual(c.timeSig, [3, 4]);
  assert.strictEqual(c.roomKey, 'C');
  assert.strictEqual(c.bpm, 60);
  const holes = c.loop.map((b, i) => (b.kind === 'hole' ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(holes, [0, 5]);
  assert.strictEqual(c.loop.length, 12);
  assert.deepStrictEqual(shape(c.loop[1]), [['E4', 0, 1, 'R', 3], ['C4', 1, 1, 'R', 1], ['D4', 2, 1, 'R', 2]]);
  assert.deepStrictEqual(shape(c.loop[2]), [['G3', 0, 3, 'L', 3]]);
  assert.deepStrictEqual(shape(c.loop[3]), [['G3', 0, 1, 'L', 0], ['D4', 1, 1, 'R', 2], ['E4', 2, 1, 'R', 3]]);
  assert.deepStrictEqual(shape(c.loop[7]), [['G3', 0, 3, 'L', 3]]);
  assert.strictEqual(c.loop[10].kind, 'defend');
  assert.strictEqual(c.loop[10].notes.length, 0);
  assert.deepStrictEqual(shape(c.loop[11]), [['C3', 0, 3, 'L', 0]]);
  const pitches = c.loop.flatMap((b) => b.notes.map((n) => n.pitch));
  assert.ok(pitches.every((p) => !p.includes('#')));
});

test('C12: New World Largo liga la quinta de la izquierda y no la vuelve a pedir', () => {
  const c = load('new-world-largo');
  assert.strictEqual(c.bpm, 104);
  assert.strictEqual(c.loop.length, 20);
  assert.deepStrictEqual(shape(c.loop[1]), [['E4', 0, 3, 'R', 3], ['G4', 3, 1, 'R', 0], ['C3', 0, 4, 'L', 5], ['G3', 0, 4, 'L', 1]]);
  const tied = (i) => c.loop[i].notes.filter((n) => n.tie).map((n) => n.pitch + n.hand);
  assert.deepStrictEqual(tied(1), []);
  assert.deepStrictEqual(tied(2), ['C3L', 'G3L']);
  assert.deepStrictEqual(tied(4), ['C3L', 'G3L']);
  assert.deepStrictEqual(tied(9), ['D4R']);
  assert.deepStrictEqual(tied(19), ['C4R', 'C3L', 'G3L']);
  assert.strictEqual(c.loop[1].notes[2].hold, 16);
  assert.strictEqual(c.loop[8].notes[0].hold, 8);
  assert.strictEqual(c.loop[9].notes[0].tieBack, 4);
  assert.deepStrictEqual(Chart.attacks(c.loop[19].notes), []);
  assert.deepStrictEqual(Chart.attacks(c.loop[9].notes).map((n) => n.pitch), ['G3']);
});

test('C13: una ligadura sin nota previa igual se toca como ataque', () => {
  const base = raw('new-world-largo');
  base.loop[2].notes[1].pitch = 'A3';
  const c = Chart.parse(base);
  const a3 = c.loop[2].notes.find((n) => n.pitch === 'A3');
  assert.strictEqual(a3.tie, undefined);
  assert.ok(Chart.attacks(c.loop[2].notes).includes(a3));
  const slice = raw('new-world-largo');
  slice.loop = slice.loop.slice(2);
  const s = Chart.parse(slice);
  assert.ok(s.loop[0].notes.every((n) => !n.tie));
});

test('C14: Camptown en Fa casi toda en la izquierda y Eine Kleine en Do con acentos', () => {
  const camp = load('camptown-races');
  assert.deepStrictEqual(camp.timeSig, [4, 4]);
  assert.strictEqual(camp.roomKey, 'F');
  assert.ok(camp.roomScale.includes('Bb'));
  assert.deepStrictEqual(shape(camp.loop[1]), [['C4', 0, 1, 'L', 1], ['C4', 1, 1, 'L', 0], ['A3', 2, 1, 'L', 0], ['C4', 3, 1, 'L', 0]]);
  assert.deepStrictEqual(shape(camp.loop[2]), [['D4', 0, 1, 'R', 1], ['C4', 1, 1, 'L', 0], ['A3', 2, 2, 'L', 0]]);
  assert.deepStrictEqual(shape(camp.loop[12]), [['F4', 0, 4, 'R', 3]]);
  assert.deepStrictEqual(shape(camp.loop[14]), [['C4', 0, 4, 'L', 1]]);
  assert.deepStrictEqual(shape(camp.loop[19]), [['F3', 0, 4, 'L', 0]]);
  const eine = load('eine-kleine');
  assert.strictEqual(eine.roomKey, 'C');
  assert.deepStrictEqual(shape(eine.loop[1]), [['C4', 0, 3, 'R', 1], ['G3', 3, 1, 'L', 3]]);
  assert.deepStrictEqual(shape(eine.loop[8]), [['F4', 0, 1, 'R', 0], ['D4', 1, 1, 'R', 0], ['B3', 2, 1, 'L', 1], ['D4', 3, 1, 'R', 0]]);
  assert.deepStrictEqual(shape(eine.loop[9]), [['G3', 0, 3, 'L', 0]]);
  const accents = eine.loop.map((b, i) => (b.notes.some((n) => n.accent) ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(accents, [1, 2, 6, 7]);

  assert.strictEqual(Chart.beatsForDuration('2.5'), null);
  assert.strictEqual(Chart.beatsForDuration('eighth'), 0.5);
  assert.strictEqual(Chart.beatsForDuration('quarter'), 1);
  const tower = raw('tower-chime');
  tower.loop[1].notes[0].dur = '2.5';
  assert.throws(() => Chart.parse(tower), /duración inválida/);
  tower.loop[1].notes[0].dur = 'eighth';
  assert.strictEqual(Chart.parse(tower).loop[1].notes[0].dur, 0.5);
  const named = raw('tower-chime');
  delete named.loop[1].notes[0].dur;
  named.loop[1].notes[0].duration = '2.5';
  assert.throws(() => Chart.parse(named), /duración inválida/);
});

test('C15: una nota del jefe suena del centro del tiempo hasta el final de su duración', () => {
  const bars = [{
    kind: 'defend',
    startBeat: 3,
    notes: [{ pitch: 'G#4', beat: 0, dur: 1 }, { pitch: 'F#4', beat: 1, dur: 1 }]
  }];
  assert.deepStrictEqual(Chart.activePitches(bars, 3.49), []);
  assert.deepStrictEqual(Chart.activePitches(bars, 3.5), ['G#4']);
  assert.deepStrictEqual(Chart.activePitches(bars, 4.49), ['G#4']);
  assert.deepStrictEqual(Chart.activePitches(bars, 4.5), ['F#4']);
  assert.deepStrictEqual(Chart.activePitches(bars, 5.5), []);
  const both = [{ kind: 'defend', startBeat: 0, notes: [{ pitch: 'C4', beat: 0, dur: 2 }, { pitch: 'C4', beat: 0, dur: 2 }, { pitch: 'E4', beat: 0, dur: 2 }] }];
  assert.deepStrictEqual(Chart.activePitches(both, 0.5), ['C4', 'E4']);
  const hole = [{ kind: 'hole', startBeat: 8, notes: [{ pitch: 'A3', beat: 1, dur: 1 }] }];
  assert.deepStrictEqual(Chart.activePitches(hole, 9.5), ['A3']);
  assert.deepStrictEqual(Chart.activePitches([{ kind: 'hole', startBeat: 0, notes: [] }], 0.5), []);
});
