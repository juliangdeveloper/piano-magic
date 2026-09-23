// test/beats.test.js — marcas de pulso del compás de Ataque.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Tape = require(path.join(__dirname, '..', 'js', 'ui', 'tape.js'));

test('el Ataque marca los 4 beats y resalta solo el pulso actual', () => {
  const marks = Tape.attackBeatMarks(8, 4, 10.2);
  assert.strictEqual(marks.length, 4);
  assert.deepStrictEqual(marks.map((m) => m.label), ['1', '2', '3', '4']);
  assert.deepStrictEqual(marks.map((m) => m.beat), [8.5, 9.5, 10.5, 11.5]);
  assert.deepStrictEqual(marks.map((m) => m.current), [false, false, true, false]);
});

test('el 1 queda dentro del primer tiempo, no sobre la barra', () => {
  const marks = Tape.attackBeatMarks(4, 4, 4);
  assert.ok(marks[0].beat > 4, 'el 1 va después de la barra izquierda');
  assert.ok(marks[3].beat < 8, 'el 4 va antes de la barra derecha');
  assert.strictEqual(marks[0].beat, 4.5);
  assert.deepStrictEqual(
    marks.slice(1).map((m, i) => m.beat - marks[i].beat),
    [1, 1, 1]
  );
  assert.strictEqual(marks[0].current, true);
  assert.strictEqual(marks[0].label, '1');
});

test('el pulso en el borde pertenece al beat que empieza ahí', () => {
  const atStart = Tape.attackBeatMarks(4, 4, 4);
  assert.strictEqual(atStart[0].current, true);
  assert.strictEqual(atStart[1].current, false);
  const atEnd = Tape.attackBeatMarks(4, 4, 8);
  assert.deepStrictEqual(atEnd.map((m) => m.current), [false, false, false, false]);
  const next = Tape.attackBeatMarks(8, 4, 8);
  assert.strictEqual(next[0].current, true);
});

test('las notas de Defiende usan el mismo centro que los pulsos', () => {
  const marks = Tape.attackBeatMarks(8, 4, 8.2);
  assert.strictEqual(Tape.chartNoteBeat(8, 0), marks[0].beat);
  assert.strictEqual(Tape.chartNoteBeat(8, 1), marks[1].beat);
  assert.strictEqual(Tape.chartNoteBeat(8, 2), marks[2].beat);
  assert.strictEqual(Tape.chartNoteBeat(8, 3), marks[3].beat);
  assert.ok(Tape.chartNoteBeat(8, 0) > 8, 'la primera nota cae dentro del compás');
  assert.ok(Tape.chartNoteBeat(8, 3) < 12, 'la última nota cae antes de la barra siguiente');
  const gaps = [1, 2, 3].map((i) => Tape.chartNoteBeat(8, i) - Tape.chartNoteBeat(8, i - 1));
  assert.deepStrictEqual(gaps, [1, 1, 1]);
  const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));
  assert.strictEqual(Tape.BEAT_CENTER, Chart.BEAT_CENTER);
  assert.strictEqual(Tape.chartNoteBeat(4, 2), 4 + Chart.hitOnset(2));
});

test('otro compás sigue el numerador', () => {
  const three = Tape.attackBeatMarks(0, 3, 1.5);
  assert.strictEqual(three.length, 3);
  assert.strictEqual(three[1].current, true);
  assert.strictEqual(three[1].label, '2');
});
