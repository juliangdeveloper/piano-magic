// test/boss-anim.test.js — el idle sigue el compás y el pico del cast cae en el golpe.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Boss = require(path.join(root, 'js', 'ui', 'boss-anim.js'));
const Chart = require(path.join(root, 'js', 'combat', 'chart.js'));

const sheetPath = path.join(root, 'assets', 'bosses', 'parade-feather', 'spritesheet.png');
const portraitPath = path.join(root, 'assets', 'bosses', 'parade-feather', 'portrait.png');
const timingsPath = path.join(root, 'assets', 'bosses', 'parade-feather', 'timings.json');
const raw = JSON.parse(fs.readFileSync(timingsPath, 'utf8'));
const spec = Boss.compile(raw);

function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('B1: idle, un cuadro por tiempo y el 0 en el tiempo 1', () => {
  assert.deepStrictEqual(Boss.pose(0, [], spec, 4), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(0.99, [], spec, 4), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(1, [], spec, 4), { row: 0, frame: 1, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(2.2, [], spec, 4), { row: 0, frame: 2, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(3.2, [], spec, 4), { row: 0, frame: 3, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(4, [], spec, 4), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(3, [], spec, 3), { row: 0, frame: 0, state: 'idle' });
  assert.strictEqual(Boss.idleFrameMs(72), 60000 / 72);
  assert.strictEqual(Boss.idleFrameMs(60), 1000);
  assert.strictEqual(Boss.idleFrameMs(120), 500);
});

test('B2: el cuadro pico del cast empieza en el golpe', () => {
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
  const lead = Boss.peakLeadBeats(spec);
  const span = Boss.castSpanBeats(spec);
  assert.deepStrictEqual(hits, [8.5, 9.5, 10.5, 11.5]);
  assert.strictEqual(hits[0], Chart.hitOnset(8));
  assert.ok(Math.abs(lead - 0.3) < 1e-12);
  assert.strictEqual(Boss.pose(8.2 - 0.02, hits, spec, 4).state, 'idle');
  assert.strictEqual(Boss.pose(6.0, hits, spec, 4).state, 'idle');
  assert.deepStrictEqual(Boss.pose(8.5 - lead + 0.001, hits, spec, 4), { row: 1, frame: 0, state: 'cast' });
  const impact = Boss.pose(8.5, hits, spec, 4);
  assert.strictEqual(impact.state, 'cast');
  assert.strictEqual(impact.frame, spec.cast.peakFrame);
  assert.strictEqual(impact.frame, 2);
  assert.strictEqual(Boss.castFrameAt(8.5, 8.5, spec), 2);
  assert.ok(Boss.castFrameAt(8.5 + 0.05, 8.5, spec) >= 1);
  assert.ok(Boss.castFrameAt(8.5 + 0.05, 8.5, spec) <= 3);
  const after = 8.5 - lead + span + 0.002;
  const idle = Boss.pose(after, [8.5], spec, 4);
  assert.strictEqual(idle.state, 'idle');
  assert.strictEqual(idle.frame, Boss.idleFrame(after, spec.idle.frames, 4, spec.idle.frameBeats));
});

test('B3: si dos golpes se pisan, manda el hit más cercano', () => {
  const hits = [8.5, 8.75];
  assert.strictEqual(Boss.pose(8.7, hits, spec, 4).frame, Boss.castFrameAt(8.7, 8.75, spec));
  assert.strictEqual(Boss.pose(8.55, hits, spec, 4).frame, Boss.castFrameAt(8.55, 8.5, spec));
  const sheet = pngSize(sheetPath);
  const portrait = pngSize(portraitPath);
  assert.deepStrictEqual(sheet, { w: 1152, h: 384 });
  assert.deepStrictEqual(portrait, { w: 238, h: 384 });
  assert.equal(fs.existsSync(path.join(root, 'assets', 'ui', 'parade-feather-sheet.png')), false);
});

test('B4: el cast escala con el bpm y el pico sigue en el mismo tiempo', () => {
  assert.deepStrictEqual(raw.cast.frameMs, [133, 117, 167, 150, 133, 133]);
  assert.strictEqual(raw.cast.peakOffsetMs, 250);
  assert.strictEqual(raw.cast.frameMs[0] + raw.cast.frameMs[1], 250);
  assert.deepStrictEqual(Boss.scaledFrameMs(spec, 72), [133, 117, 167, 150, 133, 133]);
  const full = Boss.scaledFrameMs(spec, 72);
  const half = Boss.scaledFrameMs(spec, 144);
  const slow = Boss.scaledFrameMs(spec, 36);
  for (let i = 0; i < full.length; i++) {
    assert.ok(Math.abs(half[i] * 2 - full[i]) < 1e-9);
    assert.ok(Math.abs(slow[i] / 2 - full[i]) < 1e-9);
  }
  assert.strictEqual(Boss.peakOffsetMs(spec, 72), 250);
  assert.strictEqual(Boss.peakOffsetMs(spec, 144), 125);
  assert.strictEqual(Boss.peakOffsetMs(spec, 60), 250 * 72 / 60);
  assert.ok(Math.abs(Boss.peakLeadBeats(spec) - Boss.peakOffsetMs(spec, 72) * 72 / 60000) < 1e-12);
  assert.ok(Math.abs(Boss.peakLeadBeats(spec) - Boss.peakOffsetMs(spec, 144) * 144 / 60000) < 1e-12);
  assert.strictEqual(Boss.castFrameAt(10, 10, spec), 2);
  assert.strictEqual(Boss.pose(10, [10], spec, 4).frame, 2);
});

test('B5: el ancla es la misma en todos los cuadros', () => {
  const a = Boss.place(400, 300, spec);
  const b = Boss.place(400, 300, spec);
  assert.strictEqual(spec.anchor.x, 96);
  assert.strictEqual(spec.anchor.y, 188);
  assert.strictEqual(a.dx, b.dx);
  assert.strictEqual(a.dy, b.dy);
  assert.ok(Math.abs(a.dx + spec.anchor.x * a.scale - a.anchorDestX) < 1e-9);
  assert.ok(Math.abs(a.dy + spec.anchor.y * a.scale - a.anchorDestY) < 1e-9);
  assert.ok(Math.abs(a.anchorDestX - 200) < 1e-9);
  assert.ok(Math.abs(a.anchorDestY - (300 - (192 - 188) * a.scale)) < 1e-9);
  assert.ok(a.dy >= -1e-9);
  assert.ok(a.dy + a.dh <= 300 + 1e-6);
});
