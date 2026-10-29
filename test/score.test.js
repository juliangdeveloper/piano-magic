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
          for (const n of parsed.loop[i].notes) if (!n.tie) expected.push(n.pitch);
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
  const tape = Tape.create(canvas, { version: '0.1.47' });
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
  assert.match(html, /js\/combat\/score\.js\?v=0\.1\.47/);
  assert.match(app, /duringSheet/);
});

function sheetCanvas(w, h) {
  const segs = [];
  const heads = [];
  const stack = [{ x: 0, y: 0 }];
  let cx = 0;
  let cy = 0;
  function top() { return stack[stack.length - 1]; }
  const ctx = {
    beginPath() {},
    closePath() {},
    stroke() {},
    fill() {},
    save() { stack.push({ x: top().x, y: top().y }); },
    restore() { if (stack.length > 1) stack.pop(); },
    translate(x, y) { const t = top(); t.x += x; t.y += y; },
    rotate() {},
    moveTo(x, y) { cx = x; cy = y; },
    lineTo(x, y) { segs.push({ x0: cx, y0: cy, x1: x, y1: y }); cx = x; cy = y; },
    ellipse() { heads.push({ x: top().x, y: top().y }); },
    arc() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    clearRect() {},
    drawImage() {},
    setTransform() {},
    measureText() { return { width: 10 }; },
    quadraticCurveTo() {},
    bezierCurveTo() {}
  };
  return {
    clientWidth: w,
    clientHeight: h,
    width: w,
    height: h,
    style: {},
    getContext() { return ctx; },
    segs,
    heads
  };
}

test('S7: cada mano queda en su pentagrama y solo las barras de compás cruzan el sistema', () => {
  for (const id of IDS) {
    const model = Score.sheetModel(raw(id), null, null);
    const canvas = sheetCanvas(960, 240);
    Tape.create(canvas, { version: '0.1.47' }).renderSheet(model);
    const staff = canvas.segs.filter((s) => Math.abs(s.y1 - s.y0) < 0.6 && Math.abs(s.x1 - s.x0) > canvas.clientWidth * 0.7);
    const ys = staff.map((s) => s.y0).sort((a, b) => a - b);
    assert.strictEqual(ys.length, 10, id);
    const lineGap = ys[1] - ys[0];
    const trebleBottom = ys[4];
    const bassTop = ys[5];
    const gapLines = (bassTop - trebleBottom) / lineGap;
    assert.ok(gapLines >= 2 && gapLines <= 3.2, id + ' hueco ' + gapLines);
    const drawn = [];
    model.bars.forEach((bar) => {
      if (bar.kind === 'hole') return;
      (bar.notes || []).forEach((n) => drawn.push(n));
    });
    assert.strictEqual(canvas.heads.length, drawn.length, id);
    const ry = lineGap * 0.42;
    drawn.forEach((note, i) => {
      const head = canvas.heads[i];
      if (note.hand === 'L') {
        assert.ok(head.y - ry > trebleBottom, id + ' ' + note.pitch + ' L');
      } else {
        assert.ok(head.y + ry < bassTop, id + ' ' + note.pitch + ' R ' + head.y + ' ' + bassTop);
      }
    });
    canvas.segs.forEach((s) => {
      const y = (s.y0 + s.y1) / 2;
      const len = Math.abs(s.x1 - s.x0);
      const horizontal = Math.abs(s.y1 - s.y0) < 0.8;
      if (horizontal && y > trebleBottom + 1 && y < bassTop - 1 && len > lineGap * 1.6) {
        assert.fail(id + ' barra ' + len);
      }
      const vertical = Math.abs(s.x1 - s.x0) < 1.5;
      const y0 = Math.min(s.y0, s.y1);
      const y1 = Math.max(s.y0, s.y1);
      const systemBar = Math.abs(y0 - ys[0]) < 1 && Math.abs(y1 - ys[9]) < 1;
      if (vertical && !systemBar && y0 < trebleBottom + 1 && y1 > bassTop - 1) {
        assert.fail(id + ' plica cruzada');
      }
    });
  }
});

test('S9: un compás vacío de una mano es un silencio de compás entero en 3/4 y 4/4', () => {
  for (const bpb of [3, 4]) {
    const notes = [{ pitch: 'C4', beat: 0, dur: 1, hand: 'R' }];
    assert.deepStrictEqual(Tape.handRests(notes, 'L', bpb), [{ beat: 0, dur: bpb, whole: true }]);
    assert.deepStrictEqual(Tape.handRests([], 'R', bpb), [{ beat: 0, dur: bpb, whole: true }]);
  }
  const tower = Chart.parse(raw('tower-chime'));
  assert.deepStrictEqual(Tape.handRests(tower.loop[2].notes, 'R', 3), [{ beat: 0, dur: 3, whole: true }]);
});

test('S10: la quinta de la izquierda comparte plica y la mano derecha no cuenta', () => {
  const nw = Chart.parse(raw('new-world-largo'));
  const notes = nw.loop[1].notes;
  const c3 = notes.find((n) => n.pitch === 'C3');
  const info = Tape.chordInfo(notes, c3);
  assert.ok(info);
  assert.strictEqual(info.up, Tape.chordInfo(notes, notes.find((n) => n.pitch === 'G3')).up);
  assert.strictEqual(Tape.chordInfo(notes, notes.find((n) => n.pitch === 'E4')), null);
});

test('S11: la cinta usa el hueco de la partitura: MD siempre por encima de MI, con línea adicional del Do central', () => {
  for (const id of IDS) {
    const c = Chart.parse(raw(id));
    const gap = Tape.staffGapFor(c.loop, 2.2);
    assert.ok(gap >= 2, id + ' hueco ' + gap);
    let lowR = -Infinity;
    let highL = Infinity;
    for (const b of c.loop) {
      for (const n of b.notes) {
        const p = Tape.placeNote(n.pitch, n.hand);
        const y = p.staff === 'bass' ? gap + 4 - p.step / 2 : -p.step / 2;
        if (n.hand === 'R') lowR = Math.max(lowR, y);
        else highL = Math.min(highL, y);
        if (n.pitch === 'C4' && n.hand === 'R') assert.ok(1 < gap - 0.45, id + ' cabe la línea del Do central');
      }
    }
    assert.ok(highL - lowR >= 0.9, id + ' ' + lowR + ' ' + highL);
  }
});

test('S12: las ligaduras quedan dentro de su pentagrama y la MD no toca la de la MI', () => {
  const lg = 10;
  const top = 0;
  const bottom = 40;
  const bassTop = bottom + 2.2 * lg;
  const bassBottom = bassTop + 40;
  const tb = Tape.tieBounds('treble', top, bottom, bassTop, bassBottom, lg);
  const bb = Tape.tieBounds('bass', top, bottom, bassTop, bassBottom, lg);
  const ext = (p) => p.y0 + 0.75 * (p.lift + p.thick);
  const c4 = Tape.tiePlan(bottom + lg, true, lg, 80, tb.lo, tb.hi);
  assert.strictEqual(c4.below, false);
  assert.ok(ext(c4) >= tb.lo && ext(c4) <= tb.hi);
  const g3 = Tape.tiePlan(bassTop + 0.5 * lg, false, lg, 80, bb.lo, bb.hi);
  assert.strictEqual(g3.below, false);
  assert.ok(ext(g3) >= bb.lo && ext(g3) > tb.hi);
  const c3 = Tape.tiePlan(bassBottom - 1.5 * lg, true, lg, 80, bb.lo, bb.hi);
  assert.strictEqual(c3.below, true);
  assert.ok(ext(c3) <= bb.hi);
});

test('S13: los acentos bajo la cabeza no tocan el pentagrama de la izquierda', () => {
  const c = Chart.parse(raw('eine-kleine'));
  const gap = Tape.staffGapFor(c.loop, 2.2);
  const accented = c.loop.flatMap((b) => b.notes).filter((n) => n.accent);
  assert.ok(accented.length > 0);
  for (const n of accented) {
    const p = Tape.placeNote(n.pitch, n.hand);
    assert.strictEqual(p.staff, 'treble');
    assert.ok(-p.step / 2 + 1.1 + 0.28 <= gap - 0.5, n.pitch + ' ' + gap);
  }
});
