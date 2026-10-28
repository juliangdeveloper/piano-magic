'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require('../js/combat/chart.js');
const Score = require('../js/combat/score.js');
const Rivals = require('../js/combat/rivals.js');
const Tape = require('../js/ui/tape.js');

const root = path.join(__dirname, '..');
const IDS = ['parade-feather', 'veil-boat', 'tower-chime', 'new-world-largo', 'camptown-races', 'eine-kleine'];

function raw(id) {
  return JSON.parse(fs.readFileSync(path.join(root, 'charts', id + '.json'), 'utf8'));
}

function noteSig(notes) {
  return notes.map((n) => [n.pitch, n.beat, n.dur, n.hand, n.finger == null ? null : n.finger]);
}

test('S1: tres tempos sobre el bpm del chart, sin inventar otro', () => {
  assert.deepStrictEqual(Score.TEMPOS.map((t) => t.id), ['real', 'ease', 'slow']);
  assert.deepStrictEqual(Score.TEMPOS.map((t) => t.factor), [1, 0.75, 0.5]);
  assert.deepStrictEqual(Score.TEMPOS.map((t) => t.label), ['Tempo real', 'Un poco más lento', 'Bien lento']);
  assert.strictEqual(Score.tempoById('nope').id, 'real');
  const parade = Chart.parse(raw('parade-feather'));
  assert.strictEqual(parade.bpm, 72);
  assert.strictEqual(Score.bpmFor(parade.bpm, 1), 72);
  assert.strictEqual(Score.bpmFor(parade.bpm, 0.75), 54);
  assert.strictEqual(Score.bpmFor(parade.bpm, 0.5), 36);
});

test('S2: las secciones salen del loop cargado y Parade Feather son dos frases', () => {
  const parade = Chart.parse(raw('parade-feather'));
  assert.deepStrictEqual(Score.sections(parade.loop).map((s) => [s.from, s.to]), [[0, 5], [5, 10]]);
  for (const id of IDS) {
    const parsed = Chart.parse(raw(id));
    const secs = Score.sections(parsed.loop);
    assert.ok(secs.length >= 1, id);
    assert.strictEqual(secs[0].from, 0, id);
    assert.strictEqual(secs[secs.length - 1].to, parsed.loop.length, id);
    let cursor = 0;
    for (const sec of secs) {
      assert.strictEqual(sec.from, cursor, id);
      assert.ok(sec.to > sec.from, id);
      if (sec.from > 0) assert.strictEqual(parsed.loop[sec.from].kind, 'hole', id);
      cursor = sec.to;
    }
  }
});

test('S3: la práctica usa solo las notas de la sección, al tempo elegido', () => {
  for (const id of IDS) {
    const file = raw(id);
    const parsed = Chart.parse(file);
    const secs = Score.sections(parsed.loop);
    for (const sec of secs) {
      for (const tempo of Score.TEMPOS) {
        const before = JSON.stringify(file);
        const pracRaw = Score.practiceChart(file, sec, tempo.id);
        assert.strictEqual(JSON.stringify(file), before, id);
        const prac = Chart.parse(pracRaw);
        assert.strictEqual(prac.bpm, Score.bpmFor(parsed.bpm, tempo.factor), id + ' ' + tempo.id);
        assert.strictEqual(prac.setup.bars, 0, id);
        assert.strictEqual(prac.title, parsed.title, id);
        assert.strictEqual(prac.loop.length, sec.to - sec.from, id);
        for (let i = 0; i < prac.loop.length; i++) {
          assert.deepStrictEqual(noteSig(prac.loop[i].notes), noteSig(parsed.loop[sec.from + i].notes), id);
        }
        const pack = Score.loopNotes(file, sec);
        const expected = [];
        for (let i = sec.from; i < sec.to; i++) {
          for (const n of parsed.loop[i].notes) expected.push(n.pitch);
        }
        assert.deepStrictEqual(pack.notes.map((n) => n.pitch), expected, id);
        assert.strictEqual(pack.beats, (sec.to - sec.from) * Chart.beatsPerBar(parsed), id);
      }
    }
  }
});

test('S4: el modo libre no recupera notas que el chart libre no tiene', () => {
  const base = raw('parade-feather');
  const free = Rivals.freeChart(base);
  const parsed = Chart.parse(free);
  const sec = Score.sections(parsed.loop)[0];
  const prac = Chart.parse(Score.practiceChart(free, sec, 'slow'));
  assert.deepStrictEqual(prac.loop.map((b) => b.notes.length), [0]);
  assert.strictEqual(prac.bpm, Score.bpmFor(parsed.bpm, 0.5));
  assert.strictEqual(Score.loopNotes(free, sec).notes.length, 0);
  assert.ok(base.loop.some((b) => (b.notes || []).length > 0));
});

test('S5: la partitura dibuja el chart completo y el compás cae en su sección', () => {
  const file = raw('parade-feather');
  const model = Score.sheetModel(file, { from: 5, to: 10 }, 22);
  assert.strictEqual(model.bars.length, 10);
  assert.strictEqual(model.from, 5);
  assert.strictEqual(model.to, 10);
  assert.strictEqual(model.beat, 22);
  assert.deepStrictEqual(model.bars.map((b) => b.kind), Chart.parse(file).loop.map((b) => b.kind));
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return function () { calls.push(prop); return target; };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  const canvas = {
    clientWidth: 880,
    clientHeight: 160,
    width: 880,
    height: 160,
    style: {},
    getContext: function () { return ctx; }
  };
  const tape = Tape.create(canvas, { version: '0.1.41' });
  tape.renderSheet(model);
  assert.ok(calls.includes('fillRect'));
  const early = tape.barIndexAt(70);
  const late = tape.barIndexAt(760);
  assert.ok(early >= 0 && early < 5, String(early));
  assert.ok(late >= 5 && late < 10, String(late));
  assert.strictEqual(tape.barIndexAt(2), -1);
});

test('S6: pausa abre la partitura y el toque del rival tiene dos salidas', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(app, /openSheet\(true\)/);
  assert.match(app, /function pauseFight\(\) \{[\s\S]*openSheet\(true\)/);
  assert.match(app, /function onRivalTap\(id\)/);
  assert.match(app, /startRealFight/);
  assert.match(app, /startPractice/);
  assert.match(app, /practiceMode/);
  assert.match(app, /Score\.practiceChart\(scoreChart/);
  assert.match(app, /Score\.sections\(/);
  assert.match(app, /!practiceMode/);
  assert.match(html, /id="rivalGate"/);
  assert.match(html, /id="btnGateScore"/);
  assert.match(html, /id="btnGateFight"/);
  assert.match(html, /Ver partitura/);
  assert.match(html, /Jugar/);
  assert.match(html, /id="sheet"/);
  assert.match(html, /id="sheetStaff"/);
  assert.match(html, /id="btnPractice"/);
  assert.match(html, /Practicar/);
  assert.match(html, /id="btnSheetLoop"/);
  assert.match(html, /js\/combat\/score\.js\?v=0\.1\.41/);
  assert.match(app, /duringSheet/);
});
