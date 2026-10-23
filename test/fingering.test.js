// test/fingering.test.js — dedo 1–5 en el chart, y el pentagrama solo numera esas notas.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));
const Tape = require(path.join(__dirname, '..', 'js', 'ui', 'tape.js'));

function rawChart(note) {
  return {
    id: 'sala',
    title: 'Sala',
    bpm: 60,
    timeSig: [4, 4],
    roomKey: 'C',
    setup: { bars: 1 },
    loop: [{ i: 0, kind: 'defend', notes: [note] }],
    hp: { player: 15, boss: 20 }
  };
}

test('F1: el chart acepta dedo 1–5 y rechaza cualquier otro', () => {
  for (let finger = 1; finger <= 5; finger++) {
    const c = Chart.parse(rawChart({ pitch: 'C4', beat: 0, dur: 1, hand: 'R', finger }));
    assert.strictEqual(c.loop[0].notes[0].finger, finger);
  }
  const plain = Chart.parse(rawChart({ pitch: 'D4', beat: 0, dur: 1, hand: 'L' }));
  assert.strictEqual(plain.loop[0].notes[0].finger, undefined);
  for (const finger of [0, 6, 1.5, -1, '3', true]) {
    assert.throws(
      () => Chart.parse(rawChart({ pitch: 'C4', beat: 0, dur: 1, hand: 'R', finger })),
      /dedo inválido/
    );
  }
});

test('F2: el pentagrama numera solo la nota que trae dedo, arriba en la derecha y debajo en la izquierda', () => {
  const notes = [
    { pitch: 'G4', hand: 'R', finger: 1 },
    { pitch: 'D4', hand: 'R' },
    { pitch: 'G3', hand: 'L', finger: 2 },
    { pitch: 'D3', hand: 'L', finger: 5 },
    { pitch: 'C4', hand: 'R', finger: 0 },
    { pitch: 'E4', hand: 'R', finger: 1.5 }
  ];
  assert.deepStrictEqual(notes.map(Tape.fingerMark), [
    { finger: 1, hand: 'R', below: false },
    null,
    { finger: 2, hand: 'L', below: true },
    { finger: 5, hand: 'L', below: true },
    null,
    null
  ]);
  const tape = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui', 'tape.js'), 'utf8');
  assert.match(tape, /fingerMark\(note\)/);
  assert.match(tape, /if \(mark\) drawFingerNum/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const chart = fs.readFileSync(path.join(__dirname, '..', 'js', 'combat', 'chart.js'), 'utf8');
  assert.equal(app.includes('suggestFingering'), false);
  assert.equal(chart.includes('suggestFingering'), false);
});

// Posición de cinco dedos al empezar cada frase. La mano izquierda, si abre
// con un acorde, lleva un dedo en cada nota; en estas partituras abre con una.
const PHRASES = {
  'parade-feather': [
    ['R', 'C4', 1], ['L', 'C3', 5],
    ['R', 'C4', 1], ['L', 'C3', 5]
  ],
  'veil-boat': [
    ['R', 'C4', 1], ['L', 'C3', 5],
    ['R', 'C5', 5], ['L', 'C3', 5]
  ],
  'tower-chime': [
    ['R', 'G#4', 3],
    ['R', 'E4', 1],
    ['R', 'G#4', 3],
    ['R', 'E4', 1],
    ['L', 'E3', 5]
  ],
  'new-world-largo': [
    ['R', 'E4', 3], ['L', 'C3', 5],
    ['R', 'E4', 3], ['L', 'C3', 5]
  ],
  'camptown-races': [
    ['R', 'D5', 5], ['L', 'G3', 2],
    ['R', 'D5', 5], ['L', 'G3', 2],
    ['R', 'G4', 1], ['L', 'G3', 1],
    ['R', 'D5', 5], ['L', 'G3', 2]
  ],
  'eine-kleine': [
    ['R', 'G4', 1], ['L', 'G3', 2],
    ['R', 'G4', 1], ['L', 'G3', 5]
  ]
};

test('F3: cada canción numera solo el ataque de cada frase, por mano', () => {
  for (const [id, expect] of Object.entries(PHRASES)) {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charts', id + '.json'), 'utf8'));
    const got = [];
    for (const bar of file.loop) {
      for (const note of bar.notes || []) {
        if (note.finger == null) continue;
        got.push([note.hand, note.pitch, note.finger]);
      }
    }
    assert.deepStrictEqual(got, expect, id);
    const parsed = Chart.parse(file);
    const again = [];
    for (const bar of parsed.loop) {
      for (const note of bar.notes) {
        if (note.finger == null) continue;
        again.push([note.hand, note.pitch, note.finger]);
      }
    }
    assert.deepStrictEqual(again, expect, id);
  }
});
