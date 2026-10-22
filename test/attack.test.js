// test/attack.test.js — v0.1.11: Ataque por escala de sala, ritmo, figuras, ligaduras, charts nuevos.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const Spell = require(path.join(root, 'js/spell/engine.js'));
const Chart = require(path.join(root, 'js/combat/chart.js'));
const Rivals = require(path.join(root, 'js/combat/rivals.js'));
const T = require(path.join(root, 'js/instrument/translator.js'));
const CMAJ = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const GMAJ = ['G', 'A', 'B', 'C', 'D', 'E', 'F#'];
const on = (ps) => ps.map((p, i) => ({ pitch: p, beatInBar: 0.5 + i, beat: 0.5 + i }));

test('A1: base = 2 con notas de la escala; fuera de escala no cuenta', () => {
  assert.strictEqual(Spell.resolveHole(on(['D4']), CMAJ).bossDamage, 2);
  assert.strictEqual(Spell.resolveHole(on(['D4', 'F4']), CMAJ).spell.mode, 'base');
  const out = Spell.resolveHole(on(['C#4', 'F#4']), CMAJ);
  assert.strictEqual(out.bossDamage, 0);
  assert.strictEqual(out.kind, 'hole-idle');
});
test('A2: tríada mayor de la tónica = 2×2, con mejora ×1.5 = 6', () => {
  assert.strictEqual(Spell.resolveHole(on(['C4', 'E4', 'G4']), CMAJ).bossDamage, 4);
  assert.strictEqual(Spell.resolveHole(on(['G4', 'B4', 'D5']), GMAJ).bossDamage, 4);
  assert.strictEqual(Spell.resolveHole(on(['G4', 'B4', 'D5']), CMAJ).bossDamage, 2, 'G-B-D en sala C = base');
  const buffs = [{ id: 'atk', amount: 0.5, remaining: 2 }];
  assert.strictEqual(Spell.resolveHole(on(['C4', 'E4', 'G4']), CMAJ, { buffs }).bossDamage, 6);
  assert.strictEqual(Spell.resolveHole(on(['D4']), CMAJ, { buffs }).bossDamage, 3, 'la mejora también sube el base');
});
test('A3: tríada menor de la tónica = mejora, 0 daño (gana a todo)', () => {
  const r = Spell.resolveHole(on(['C4', 'Eb4', 'G4', 'E4']), CMAJ);
  assert.strictEqual(r.spell.mode, 'minor');
  assert.strictEqual(r.bossDamage, 0);
  assert.ok(r.buff && r.buff.amount === 0.5);
  assert.strictEqual(Spell.resolveHole(on(['A4', 'C5', 'E5']), CMAJ).spell.mode, 'base', 'La menor no es tónica de sala C');
});
test('A4: pentatónica (≥4 pcs de la penta con 2ª o 6ª) cura 3 y gana a tríada mayor', () => {
  const r = Spell.resolveHole(on(['C4', 'D4', 'E4', 'G4']), CMAJ);
  assert.strictEqual(r.spell.mode, 'pentatonic');
  assert.strictEqual(r.heal, 3);
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(Spell.resolveHole(on(['C4', 'E4', 'G4', 'F4']), CMAJ).spell.mode, 'major', 'con F no es penta');
});
test('A5: rejilla rítmica: negra ±0.20, corchea ±0.12, semicorchea ±0.06', () => {
  assert.ok(Spell.snapOnset(0.5).ok);
  assert.ok(Spell.snapOnset(0.68).ok);
  assert.ok(!Spell.snapOnset(0.85).ok);
  assert.ok(Spell.snapOnset(1.1).ok);
  assert.ok(!Spell.snapOnset(1.15).ok);
  assert.ok(Spell.snapOnset(1.30).ok);
  const r = Spell.resolveHole([{ pitch: 'C4', beatInBar: 0.85 }], CMAJ);
  assert.strictEqual(r.bossDamage, 0, 'fuera de tiempo no cuenta');
  assert.strictEqual(r.offGrid, 1);
});
test('A6: cuantización de duraciones con puntillos', () => {
  const q = (b) => Spell.quantizeDuration(b).name;
  assert.strictEqual(q(4.2), 'redonda');
  assert.strictEqual(q(2.9), 'blanca con puntillo');
  assert.strictEqual(q(1.9), 'blanca');
  assert.strictEqual(q(1.45), 'negra con puntillo');
  assert.strictEqual(q(0.95), 'negra');
  assert.strictEqual(q(0.7), 'corchea con puntillo');
  assert.strictEqual(q(0.5), 'corchea');
  assert.strictEqual(q(0.2), 'semicorchea');
  assert.strictEqual(Spell.quantizeDuration(0), null);
});
test('A7: ligaduras: 1.25 = negra⁀semicorchea; cruza mitad y barra', () => {
  const names = (p, b) => Spell.splitTied(p, b, 4).map((s) => s.name);
  assert.deepStrictEqual(names(0, 1.25), ['negra', 'semicorchea']);
  assert.deepStrictEqual(names(0, 3), ['blanca con puntillo']);
  assert.deepStrictEqual(names(1, 2), ['negra', 'negra'], 'cruza el pulso 3');
  assert.deepStrictEqual(names(3, 2), ['negra', 'negra'], 'cruza la barra');
  assert.deepStrictEqual(names(0.5, 1), ['corchea', 'corchea']);
  const s = Spell.splitTied(0, 1.25, 4);
  assert.ok(s[0].tied && !s[1].tied);
});

const CHARTS = ['parade-feather', 'veil-boat', 'tower-chime', 'new-world-largo', 'camptown-races', 'eine-kleine'];
for (const id of CHARTS) {
  test('A8: chart ' + id + ' válido, escala de sala, rango C3–A5, una nota por mano', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'charts', id + '.json'), 'utf8'));
    const c = Chart.parse(raw);
    assert.ok(Array.isArray(c.roomScale) && c.roomScale.length === 7);
    assert.strictEqual(T.pitchClass(c.roomScale[0] + '4'), T.pitchClass(c.roomKey + '4'));
    const osk = new Set(Object.values(T.KEY_MAP).map((p) => T.pitchToMidi(p)));
    const bpb = Chart.beatsPerBar(c);
    if (id === 'tower-chime') {
      const holes = c.loop.map((b, i) => (b.kind === 'hole' ? i : -1)).filter((i) => i >= 0);
      assert.deepStrictEqual(holes, [7, 15]);
      assert.strictEqual(c.loop.filter((b) => b.kind === 'defend').length, 24);
    } else {
      assert.strictEqual(c.loop.length % 5, 0);
    }
    c.loop.forEach((b, i) => {
      if (id !== 'tower-chime') assert.strictEqual(b.kind, i % 5 === 0 ? 'hole' : 'defend');
      const notes = b.notes.slice().sort((a, z) => a.beat - z.beat || (a.hand === 'L' ? -1 : 1));
      let active = [];
      for (const n of notes) {
        const m = T.pitchToMidi(n.pitch);
        assert.ok(m >= 48 && m <= 81, n.pitch + ' en C3–A5');
        if (n.hand === 'L') assert.ok(m <= 71, n.pitch + ' grave de la izquierda');
        assert.ok(osk.has(m), n.pitch + ' en teclado en pantalla');
        assert.ok(n.hand === 'L' || n.hand === 'R', 'mano');
        assert.ok(n.beat + n.dur <= bpb + 1e-9);
        active = active.filter((a) => a.end > n.beat + 1e-9);
        assert.ok(!active.some((a) => a.hand === n.hand), 'la misma mano no se pisa');
        assert.ok(active.length < 2, 'como mucho dos voces');
        active.push({ hand: n.hand, end: n.beat + n.dur });
      }
    });
    assert.ok(Rivals.options().some((o) => o.chart === 'charts/' + id + '.json'));
  });
}
