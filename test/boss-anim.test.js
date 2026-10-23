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

test('B6: Veil Boat en 6/8, el cuadro 0 y el 2 en los pulsos de negra con puntillo', () => {
  const veilRaw = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'bosses', 'veil-boat', 'timings.json'), 'utf8'));
  const veil = Boss.compile(veilRaw);
  const chart = Chart.parse(JSON.parse(fs.readFileSync(path.join(root, 'charts', 'veil-boat.json'), 'utf8')));
  const bpb = Chart.beatsPerBar(chart);
  const starts = Boss.idleStarts(veil, bpb);
  const beatMs = 60000 / 84;
  assert.strictEqual(chart.bpm, 84);
  assert.deepStrictEqual(chart.timeSig, [6, 8]);
  assert.strictEqual(bpb, 3);
  assert.deepStrictEqual(veilRaw.idle.frameMs, [536, 536, 536, 535]);
  assert.equal(/workspace|pipeline|gif/i.test(JSON.stringify(veilRaw)), false);
  assert.strictEqual(starts[0], 0);
  assert.ok(Math.abs(starts[2] - 1.5) * beatMs < 1);
  assert.deepStrictEqual(Boss.pose(0, [], veil, bpb), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(1.5, [], veil, bpb), { row: 0, frame: 2, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(3, [], veil, bpb), { row: 0, frame: 0, state: 'idle' });
  assert.deepStrictEqual(Boss.pose(4.5, [], veil, bpb), { row: 0, frame: 2, state: 'idle' });
  assert.strictEqual(Boss.pose(1, [], veil, bpb).frame, 1);
  assert.deepStrictEqual(Boss.scaledIdleFrameMs(veil, 84), [536, 536, 536, 535]);
  const half = Boss.scaledIdleFrameMs(veil, 168);
  assert.deepStrictEqual(half, [268, 268, 268, 267.5]);
  const sheet = pngSize(path.join(root, 'assets', 'bosses', 'veil-boat', 'spritesheet.png'));
  const portrait = pngSize(path.join(root, 'assets', 'bosses', 'veil-boat', 'portrait.png'));
  assert.deepStrictEqual(sheet, { w: 1152, h: 384 });
  assert.deepStrictEqual(portrait, { w: 396, h: 384 });
});

test('B7: el pico del cast de Veil Boat cae en el golpe', () => {
  const veil = Boss.compile(JSON.parse(fs.readFileSync(path.join(root, 'assets', 'bosses', 'veil-boat', 'timings.json'), 'utf8')));
  const chart = Chart.parse(JSON.parse(fs.readFileSync(path.join(root, 'charts', 'veil-boat.json'), 'utf8')));
  const bpb = Chart.beatsPerBar(chart);
  const defend = Chart.barAt(chart, 2);
  const hits = Boss.attackHits([defend]);
  const hit = hits[0];
  assert.strictEqual(defend.kind, 'defend');
  assert.strictEqual(hit, defend.startBeat + Chart.BEAT_CENTER);
  assert.strictEqual(hit, 6.5);
  assert.deepStrictEqual(Boss.scaledFrameMs(veil, 84), [119, 107, 143, 131, 107, 107]);
  assert.strictEqual(Boss.peakOffsetMs(veil, 84), 226);
  assert.strictEqual(Boss.peakOffsetMs(veil, 168), 113);
  assert.ok(Math.abs(Boss.peakLeadBeats(veil) - 226 * 84 / 60000) < 1e-12);
  const peak = Boss.pose(hit, hits, veil, bpb);
  assert.strictEqual(peak.state, 'cast');
  assert.strictEqual(peak.frame, 2);
  assert.strictEqual(Boss.castFrameAt(hit, hit, veil), veil.cast.peakFrame);
  const after = hit - Boss.peakLeadBeats(veil) + Boss.castSpanBeats(veil) + 0.02;
  const idle = Boss.pose(after, [hit], veil, bpb);
  assert.strictEqual(idle.state, 'idle');
  assert.strictEqual(idle.frame, Boss.pose(after, [], veil, bpb).frame);
});

test('B8: Tower Chime en 3/4, el cuadro 0 abre el compás y a 60 bpm dura 750 ms', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'bosses', 'tower-chime', 'timings.json'), 'utf8'));
  const tower = Boss.compile(raw);
  const chart = Chart.parse(JSON.parse(fs.readFileSync(path.join(root, 'charts', 'tower-chime.json'), 'utf8')));
  const bpb = Chart.beatsPerBar(chart);
  const starts = Boss.idleStarts(tower, bpb);
  assert.strictEqual(chart.bpm, 60);
  assert.deepStrictEqual(chart.timeSig, [3, 4]);
  assert.strictEqual(bpb, 3);
  assert.strictEqual(raw.refBpm, 72);
  assert.deepStrictEqual(raw.idle.frameMs, [625, 625, 625, 625]);
  assert.equal(/workspace|pipeline|gif/i.test(JSON.stringify(raw)), false);
  assert.deepStrictEqual(starts, [0, 0.75, 1.5, 2.25]);
  assert.deepStrictEqual(Boss.pose(0, [], tower, bpb), { row: 0, frame: 0, state: 'idle' });
  assert.strictEqual(Boss.pose(0.5, [], tower, bpb).frame, 0);
  assert.deepStrictEqual(Boss.pose(3, [], tower, bpb), { row: 0, frame: 0, state: 'idle' });
  assert.strictEqual(Boss.pose(3.2, [], tower, bpb).frame, 0);
  assert.deepStrictEqual(Boss.scaledIdleFrameMs(tower, 72), [625, 625, 625, 625]);
  assert.deepStrictEqual(Boss.scaledIdleFrameMs(tower, 60), [750, 750, 750, 750]);
  const sheet = pngSize(path.join(root, 'assets', 'bosses', 'tower-chime', 'spritesheet.png'));
  const portrait = pngSize(path.join(root, 'assets', 'bosses', 'tower-chime', 'portrait.png'));
  assert.deepStrictEqual(sheet, { w: 1152, h: 384 });
  assert.deepStrictEqual(portrait, { w: 262, h: 384 });
});

test('B9: el pico del cast de Tower Chime cae en el golpe y a 60 bpm son 300 ms', () => {
  const tower = Boss.compile(JSON.parse(fs.readFileSync(path.join(root, 'assets', 'bosses', 'tower-chime', 'timings.json'), 'utf8')));
  const chart = Chart.parse(JSON.parse(fs.readFileSync(path.join(root, 'charts', 'tower-chime.json'), 'utf8')));
  const bpb = Chart.beatsPerBar(chart);
  const defend = Chart.barAt(chart, 1);
  const hits = Boss.attackHits([defend]);
  const hit = hits[0];
  const at72 = [133, 117, 167, 150, 133, 133];
  const at60 = Boss.scaledFrameMs(tower, 60);
  assert.strictEqual(defend.kind, 'defend');
  assert.strictEqual(hit, defend.startBeat + Chart.BEAT_CENTER);
  assert.strictEqual(hit, 3.5);
  assert.deepStrictEqual(Boss.scaledFrameMs(tower, 72), at72);
  for (let i = 0; i < at72.length; i++) assert.ok(Math.abs(at60[i] - at72[i] * 1.2) < 1e-9);
  assert.strictEqual(Boss.peakOffsetMs(tower, 72), 250);
  assert.strictEqual(Boss.peakOffsetMs(tower, 60), 300);
  assert.ok(Math.abs(Boss.peakLeadBeats(tower) - 0.3) < 1e-12);
  const peak = Boss.pose(hit, hits, tower, bpb);
  assert.strictEqual(peak.state, 'cast');
  assert.strictEqual(peak.frame, 2);
  assert.strictEqual(Boss.castFrameAt(hit, hit, tower), tower.cast.peakFrame);
  const after = hit - Boss.peakLeadBeats(tower) + Boss.castSpanBeats(tower) + 0.02;
  const idle = Boss.pose(after, [hit], tower, bpb);
  assert.strictEqual(idle.state, 'idle');
  assert.strictEqual(idle.frame, Boss.pose(after, [], tower, bpb).frame);
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
