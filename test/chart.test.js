// test/chart.test.js — carga y timeline de Parade Feather, y las melodías publicadas.
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

test('C1: parade-feather.json parsea con HP 15/20, BPM 72, sala C', () => {
  const c = load();
  assert.strictEqual(c.id, 'parade-feather');
  assert.strictEqual(c.title, 'Parade Feather');
  assert.strictEqual(c.bpm, 72);
  assert.deepStrictEqual(c.timeSig, [4, 4]);
  assert.strictEqual(c.roomKey, 'C');
  assert.strictEqual(c.hp.player, 15);
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
  const last = c.loop[9].notes.map((n) => [n.pitch, n.beat, n.dur, n.hand]);
  assert.deepStrictEqual(last, [['C4', 0, 2, 'R'], ['C4', 2, 2, 'R']]);
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

test('C7: el segundo defend es C E D G, todas negras', () => {
  const c = load();
  const notes = c.loop[2].notes.map((n) => [n.pitch, n.beat, n.dur, n.hand]);
  assert.deepStrictEqual(notes, [
    ['C4', 0, 1, 'R'],
    ['E4', 1, 1, 'R'],
    ['D4', 2, 1, 'R'],
    ['G3', 3, 1, 'L']
  ]);
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

test('C9: la mano falta vale R, y L se conserva', () => {
  const base = raw('parade-feather');
  const parsed = Chart.parse(base);
  assert.ok(parsed.loop[1].notes.every((n) => n.hand === 'R'));
  base.loop[1].notes[0].hand = 'L';
  base.loop[1].notes[1].hand = 'l';
  const again = Chart.parse(base);
  assert.strictEqual(again.loop[1].notes[0].hand, 'L');
  assert.strictEqual(again.loop[1].notes[1].hand, 'L');
  assert.strictEqual(again.loop[1].notes[2].hand, 'R');
});

test('C10: Veil Boat es Row Your Boat entero en 6/8, desde C4 hasta el dream', () => {
  const c = load('veil-boat');
  assert.deepStrictEqual(c.timeSig, [6, 8]);
  assert.strictEqual(Chart.beatsPerBar(c), 3);
  const right = (bar) => bar.notes.filter((n) => n.hand === 'R');
  assert.strictEqual(right(c.loop[1])[0].pitch, 'C4');
  assert.strictEqual(right(c.loop[1])[0].dur, 1.5);
  assert.deepStrictEqual(right(c.loop[6]).map((n) => n.pitch), ['C5', 'C5', 'C5', 'G4', 'G4', 'G4']);
  assert.deepStrictEqual(right(c.loop[9]).map((n) => [n.pitch, n.dur]), [['C4', 3]]);
  assert.deepStrictEqual(c.loop[1].notes.filter((n) => n.hand === 'L').map((n) => [n.pitch, n.beat, n.dur]), [
    ['C3', 0, 1.5],
    ['G3', 1.5, 1.5]
  ]);
});

test('C11: Tower Chime abre con el primer cambio y cierra el ciclo en E', () => {
  const c = load('tower-chime');
  assert.deepStrictEqual(c.timeSig, [3, 4]);
  assert.strictEqual(c.roomKey, 'E');
  assert.deepStrictEqual(c.loop[1].notes.map((n) => n.pitch), ['G#4', 'F#4', 'E4', 'B3']);
  assert.strictEqual(c.loop[1].notes.find((n) => n.pitch === 'B3').hand, 'L');
  assert.ok(c.loop[1].notes.filter((n) => n.pitch !== 'B3').every((n) => n.hand === 'R'));
  const last = c.loop[c.loop.length - 1].notes;
  assert.strictEqual(last[last.length - 1].pitch, 'E4');
  assert.strictEqual(last[last.length - 1].dur, 1.5);
});

test('C12: New World Largo lleva piano y forte, sin acentos', () => {
  const c = load('new-world-largo');
  assert.strictEqual(c.bpm, 104);
  const notes = c.loop.flatMap((b) => b.notes);
  assert.ok(notes.some((n) => n.dynamic === 'p'));
  assert.ok(notes.some((n) => n.dynamic === 'f'));
  assert.ok(notes.every((n) => n.accent !== true));
  assert.strictEqual(c.loop[1].notes[0].pitch, 'E4');
  assert.strictEqual(c.loop[1].notes[0].dur, 1.5);
});

test('C13: Camptown compases 7 y 15, y Eine Kleine baja de G a D', () => {
  const rh = (bar) => bar.notes.filter((n) => n.hand === 'R');
  const camp = load('camptown-races').loop.filter((b) => b.kind === 'defend');
  assert.deepStrictEqual(rh(camp[6]).map((n) => [n.pitch, n.beat, n.dur]), [
    ['A4', 0, 2],
    ['B4', 2, 1],
    ['A4', 3, 1]
  ]);
  assert.deepStrictEqual(rh(camp[14]).map((n) => [n.pitch, n.beat, n.dur]), [
    ['A4', 0, 1],
    ['B4', 1, 0.5],
    ['C5', 1.5, 0.5],
    ['B4', 2, 0.5],
    ['A4', 2.5, 1],
    ['A4', 3.5, 0.5]
  ]);
  assert.ok(camp[0].notes.some((n) => n.hand === 'L' && n.pitch === 'G3'));
  const eine = load('eine-kleine').loop.filter((b) => b.kind === 'defend');
  assert.deepStrictEqual(rh(eine[0]).map((n) => [n.pitch, n.beat, n.dur]), [
    ['G4', 0, 1],
    ['D4', 1.5, 0.5],
    ['G4', 2, 1],
    ['D4', 3.5, 0.5]
  ]);
  assert.ok(rh(eine[0]).every((n) => n.hand === 'R'));
  assert.strictEqual(rh(eine[7])[rh(eine[7]).length - 1].pitch, 'F#4');
});

test('C14: la mano izquierda corregida, y "2.5" no es una duración', () => {
  const lh = (id, measure) => {
    const bars = load(id).loop.filter((b) => b.kind === 'defend');
    return bars[measure - 1].notes.filter((n) => n.hand === 'L').map((n) => [n.pitch, n.beat, n.dur]);
  };
  assert.deepStrictEqual(lh('new-world-largo', 7), [['F3', 0, 2], ['G3', 2, 2]]);
  assert.deepStrictEqual(lh('camptown-races', 7), [['D3', 0, 4]]);
  assert.deepStrictEqual(lh('camptown-races', 9), [['G3', 0, 2], ['G3', 2, 2]]);
  assert.deepStrictEqual(lh('camptown-races', 12), [['G3', 0, 4]]);
  assert.deepStrictEqual(lh('camptown-races', 15), [['C3', 0, 2], ['D3', 2, 2]]);
  assert.deepStrictEqual(lh('eine-kleine', 3), [['D3', 0, 2], ['A3', 2, 2]]);
  assert.deepStrictEqual(lh('tower-chime', 6), [['B3', 0, 0.5]]);
  assert.deepStrictEqual(lh('tower-chime', 12), [['B3', 0, 0.5]]);

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
