// test/boss-anim.test.js — el idle sigue el pulso y el cast cae en el golpe.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Boss = require(path.join(root, 'js', 'ui', 'boss-anim.js'));
const Chart = require(path.join(root, 'js', 'combat', 'chart.js'));

test('B1: el pulso del idle es el mismo centro que el metrónomo', () => {
  const beats = [-1, 0, 0.49, 0.5, 1.49, 1.5, 2.5, 3.5, 4.5, 8.5, 12];
  for (let i = 0; i < beats.length; i++) {
    assert.strictEqual(Boss.centerReached(beats[i]), Chart.centerReached(beats[i]));
  }
  assert.deepStrictEqual(Boss.pose(0.49, []), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(0.5, []), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(1.49, []), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(1.5, []), { row: 0, frame: 1, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(2.5, []), { row: 0, frame: 2, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(3.5, []), { row: 0, frame: 3, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(4.5, []), { row: 0, frame: 0, state: 'idle' });
});

test('B2: el cuadro 3 del cast empieza en el hit y no en los ataques del jugador', () => {
  const ribbon = [
    { kind: 'setup', startBeat: 0, notes: [] },
    { kind: 'hole', startBeat: 4, notes: [{ beat: 0, pitch: 'C4' }] },
    {
      kind: 'defend',
      startBeat: 8,
      notes: [{ beat: 0 }, { beat: 1 }, { beat: 2 }, { beat: 3 }]
    }
  ];
  const hits = Boss.attackHits(ribbon);
  assert.deepStrictEqual(hits, [8.5, 9.5, 10.5, 11.5]);
  assert.strictEqual(hits[0], Chart.hitOnset(8));
  assert.strictEqual(Boss.pose(2.4, hits).state, 'idle');
  assert.strictEqual(Boss.pose(6.0, hits).state, 'idle');
  assert.deepStrictEqual(Boss.pose(8.0, hits), { row: 1, frame: 0, state: 'cast' });
  assert.deepStrictEqual(Boss.pose(8.499, hits), { row: 1, frame: 2, state: 'cast' });
  const impact = Boss.pose(8.5, hits);
  assert.strictEqual(impact.state, 'cast');
  assert.strictEqual(impact.frame, Boss.CAST_HIT);
  assert.strictEqual(impact.frame, 3);
  assert.deepStrictEqual(Boss.pose(9.0, hits), { row: 1, frame: 0, state: 'cast' });
  assert.strictEqual(Boss.pose(7.9, [8.5]).state, 'idle');
  assert.strictEqual(Boss.pose(9.0, [8.5]).state, 'idle');
});

test('B3: si dos golpes se pisan, manda el hit más cercano', () => {
  const hits = [8.5, 8.75];
  assert.strictEqual(Boss.pose(8.7, hits).frame, Boss.castFrameAt(8.7, 8.75));
  assert.strictEqual(Boss.pose(8.55, hits).frame, Boss.castFrameAt(8.55, 8.5));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'parade-feather-sheet.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'parade-feather-portrait.jpg')));
});
