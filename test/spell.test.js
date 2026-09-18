// test/spell.test.js — SpellEngine: modo, elemento, círculo de quintas, resolve.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Spell = require(path.join(__dirname, '..', 'js', 'spell', 'engine.js'));

function played(pitches, beat0) {
  return pitches.map(function (p, i) {
    return { pitch: p, beatInBar: (beat0 || 0) + i, beat: (beat0 || 0) + i };
  });
}

const EXPECT_C = [
  { pitch: 'C4', beat: 0, dur: 1 },
  { pitch: 'C4', beat: 1, dur: 1 },
  { pitch: 'C4', beat: 2, dur: 1 },
  { pitch: 'C4', beat: 3, dur: 1 }
];

test('S1: C D E en sala C → mayor / ataque / Tierra / mult 1.5', () => {
  const s = Spell.classify(['C4', 'D4', 'E4'], 'C');
  assert.strictEqual(s.mode, 'major');
  assert.strictEqual(s.action, 'attack');
  assert.strictEqual(s.degree, 1);
  assert.strictEqual(s.element.id, 'tierra');
  assert.strictEqual(s.circleDistance, 0);
  assert.strictEqual(s.multiplier, 1.5);
});

test('S2: C Eb G → menor / buff', () => {
  const s = Spell.classify(['C4', 'Eb4', 'G4'], 'C');
  assert.strictEqual(s.mode, 'minor');
  assert.strictEqual(s.action, 'buff');
  assert.strictEqual(Spell.modeToAction('minor'), 'buff');
});

test('S3: C D E G A → pentatónica / cura', () => {
  const s = Spell.classify(['C4', 'D4', 'E4', 'G4', 'A4'], 'C');
  assert.strictEqual(s.mode, 'pentatonic');
  assert.strictEqual(s.action, 'heal');
});

test('S4: círculo de quintas C–G = 1, C–F# = 6, C–C = 0', () => {
  assert.strictEqual(Spell.circleDistance('C', 'G'), 1);
  assert.strictEqual(Spell.circleDistance('C', 'F#'), 6);
  assert.strictEqual(Spell.circleDistance('C', 'C'), 0);
  assert.strictEqual(Spell.circleDistance('G', 'C'), 1);
});

test('S5: multiplicador por distancia 0/1/3/5', () => {
  assert.strictEqual(Spell.roomMultiplier(0), 1.5);
  assert.strictEqual(Spell.roomMultiplier(1), 1.0);
  assert.strictEqual(Spell.roomMultiplier(3), 0.75);
  assert.strictEqual(Spell.roomMultiplier(5), 0.5);
});

test('S6: grado 5 → Trueno', () => {
  assert.strictEqual(Spell.elementForDegree(5).id, 'trueno');
  assert.strictEqual(Spell.elementForDegree(5).icon, '⚡');
});

test('S7: defend perfecto CCCC en C → 3 daño al jefe (2×1.5)', () => {
  const r = Spell.resolveDefend(played(['C4', 'C4', 'C4', 'C4']), EXPECT_C, 'C');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'defend-hit');
  assert.strictEqual(r.hits, 4);
  assert.strictEqual(r.spell.action, 'attack');
  assert.strictEqual(r.bossDamage, 3);
  assert.strictEqual(r.playerDamage, 0);
});

test('S8: defend sin notas → miss, 3 daño al jugador', () => {
  const r = Spell.resolveDefend([], EXPECT_C, 'C');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kind, 'defend-miss');
  assert.strictEqual(r.playerDamage, Spell.MISS_DAMAGE);
  assert.strictEqual(r.bossDamage, 0);
});

test('S9: notas fuera de ventana no cuentan', () => {
  const late = [{ pitch: 'C4', beatInBar: 2.2, beat: 2.2 }];
  const expected = [{ pitch: 'C4', beat: 0, dur: 1 }];
  const m = Spell.matchNotes(late, expected, 0.45);
  assert.strictEqual(m.hitCount, 0);
  assert.strictEqual(m.extras.length, 1);
});

test('S10: agujero con notas → hole-miss; silencio → hole-clear', () => {
  const miss = Spell.resolveHole(played(['C4']));
  assert.strictEqual(miss.ok, false);
  assert.strictEqual(miss.kind, 'hole-miss');
  assert.strictEqual(miss.playerDamage, Spell.HOLE_DAMAGE);
  const clear = Spell.resolveHole([]);
  assert.strictEqual(clear.ok, true);
  assert.strictEqual(clear.kind, 'hole-clear');
  assert.strictEqual(clear.playerDamage, 0);
});

test('S11: pentatónica perfecta cura 3 (no daña jefe)', () => {
  const expected = [
    { pitch: 'C4', beat: 0, dur: 1 },
    { pitch: 'D4', beat: 1, dur: 1 },
    { pitch: 'E4', beat: 2, dur: 1 },
    { pitch: 'G4', beat: 3, dur: 1 }
  ];
  // include A as extra? would hurt accuracy. Play C D E G matching expected,
  // classify: C D E G is penta with 5th → heal. hits 4/4.
  const r = Spell.resolveDefend(played(['C4', 'D4', 'E4', 'G4']), expected, 'C');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.spell.action, 'heal');
  assert.strictEqual(r.heal, Spell.BASE_HEAL);
  assert.strictEqual(r.bossDamage, 0);
});

test('S12: menor C Eb G → buff ATQ+', () => {
  const expected = [
    { pitch: 'C4', beat: 0, dur: 1 },
    { pitch: 'Eb4', beat: 1, dur: 1 },
    { pitch: 'G4', beat: 2, dur: 1 }
  ];
  const r = Spell.resolveDefend(played(['C4', 'Eb4', 'G4']), expected, 'C');
  assert.strictEqual(r.spell.action, 'buff');
  assert.ok(r.buff);
  assert.strictEqual(r.buff.id, 'atk');
  assert.strictEqual(r.buff.remaining, 2);
});

test('S13: setup no hace daño', () => {
  const r = Spell.resolveSetup();
  assert.strictEqual(r.kind, 'setup');
  assert.strictEqual(r.playerDamage, 0);
  assert.strictEqual(r.bossDamage, 0);
});

test('S14: buff ATQ+ aumenta el ataque', () => {
  const r = Spell.resolveDefend(
    played(['C4', 'C4', 'C4', 'C4']),
    EXPECT_C,
    'C',
    { buffs: [{ id: 'atk', amount: 0.5, remaining: 2 }] }
  );
  // 2 * 1.5 * 1.5 * 1 = 4.5 → 5
  assert.strictEqual(r.bossDamage, 5);
});
