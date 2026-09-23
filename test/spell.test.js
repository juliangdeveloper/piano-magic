// test/spell.test.js — SpellEngine v0.1.1: 12 claves, ×sala, Defend copia, Hole DPS.
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

test('S1: C D E en sala C → mayor / ataque / Agua / ×sala 1.0', () => {
  const s = Spell.classify(['C4', 'D4', 'E4'], 'C');
  assert.strictEqual(s.mode, 'major');
  assert.strictEqual(s.action, 'attack');
  assert.strictEqual(s.tonic, 'C');
  assert.strictEqual(s.element.id, 'agua');
  assert.strictEqual(s.element.label, 'Agua');
  assert.strictEqual(s.circleDistance, 0);
  assert.strictEqual(s.multiplier, 1.0);
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
  assert.strictEqual(Spell.circleDistance('C', 'Gb'), 6);
  assert.strictEqual(Spell.circleDistance('C', 'Db'), 5);
});

test('S5: ×sala por pasos 0..6', () => {
  assert.strictEqual(Spell.roomMultiplier(0), 1.0);
  assert.strictEqual(Spell.roomMultiplier(1), 0.85);
  assert.strictEqual(Spell.roomMultiplier(2), 0.7);
  assert.strictEqual(Spell.roomMultiplier(3), 0.5);
  assert.strictEqual(Spell.roomMultiplier(4), 0.35);
  assert.strictEqual(Spell.roomMultiplier(5), 0.2);
  assert.strictEqual(Spell.roomMultiplier(6), 0);
});

test('S6: 12 claves → elemento (enarmónicos Gb=F#, C#=Db)', () => {
  assert.strictEqual(Spell.elementForKey('C').id, 'agua');
  assert.strictEqual(Spell.elementForKey('G').id, 'planta');
  assert.strictEqual(Spell.elementForKey('D').id, 'electrico');
  assert.strictEqual(Spell.elementForKey('A').id, 'volador');
  assert.strictEqual(Spell.elementForKey('E').id, 'lucha');
  assert.strictEqual(Spell.elementForKey('B').id, 'dragon');
  assert.strictEqual(Spell.elementForKey('F#').id, 'fuego');
  assert.strictEqual(Spell.elementForKey('Gb').id, 'fuego');
  assert.strictEqual(Spell.elementForKey('Db').id, 'hielo');
  assert.strictEqual(Spell.elementForKey('C#').id, 'hielo');
  assert.strictEqual(Spell.elementForKey('Ab').id, 'tierra');
  assert.strictEqual(Spell.elementForKey('G#').id, 'tierra');
  assert.strictEqual(Spell.elementForKey('Eb').id, 'roca');
  assert.strictEqual(Spell.elementForKey('Bb').id, 'psiquico');
  assert.strictEqual(Spell.elementForKey('F').id, 'hada');
});

test('S7: defend perfecto CCCC → 0 daño jefe, 0 daño jugador, grade perfect', () => {
  const r = Spell.resolveDefend(played(['C4', 'C4', 'C4', 'C4']), EXPECT_C, 'C');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'defend-perfect');
  assert.strictEqual(r.grade, 'perfect');
  assert.strictEqual(r.hits, 4);
  assert.strictEqual(r.spell, null);
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.heal, 0);
  assert.strictEqual(r.buff, null);
  assert.strictEqual(r.playerDamage, 0);
});

test('S8: defend sin notas → fail, 3 daño al jugador, 0 al jefe', () => {
  const r = Spell.resolveDefend([], EXPECT_C, 'C');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.kind, 'defend-fail');
  assert.strictEqual(r.grade, 'fail');
  assert.strictEqual(r.playerDamage, Spell.MISS_DAMAGE);
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.heal, 0);
  assert.strictEqual(r.buff, null);
});

test('S9: notas fuera de ventana no cuentan', () => {
  const late = [{ pitch: 'C4', beatInBar: 2.2, beat: 2.2 }];
  const expected = [{ pitch: 'C4', beat: 0, dur: 1 }];
  const m = Spell.matchNotes(late, expected, 0.45);
  assert.strictEqual(m.hitCount, 0);
  assert.strictEqual(m.extras.length, 1);
});

test('S10: agujero silencio = idle sin daño; tocar no pune al jugador', () => {
  const idle = Spell.resolveHole([]);
  assert.strictEqual(idle.ok, true);
  assert.strictEqual(idle.kind, 'hole-idle');
  assert.strictEqual(idle.playerDamage, 0);
  assert.strictEqual(idle.bossDamage, 0);

  const one = Spell.resolveHole(played(['C4']), 'C');
  assert.strictEqual(one.playerDamage, 0);
  assert.strictEqual(one.kind, 'hole-idle');
});

test('S11: hole pentatónica cura (no daña jefe, no daña jugador)', () => {
  const r = Spell.resolveHole(played(['C4', 'D4', 'E4', 'G4', 'A4']), 'C');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'hole-spell');
  assert.strictEqual(r.spell.action, 'heal');
  assert.strictEqual(r.heal, Spell.BASE_HEAL);
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.playerDamage, 0);
});

test('S12: hole menor C Eb G → buff ATQ+, 0 daño jugador', () => {
  const r = Spell.resolveHole(played(['C4', 'Eb4', 'G4']), 'C');
  assert.strictEqual(r.spell.action, 'buff');
  assert.ok(r.buff);
  assert.strictEqual(r.buff.id, 'atk');
  assert.strictEqual(r.buff.remaining, 2);
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.playerDamage, 0);
});

test('S13: setup no hace daño', () => {
  const r = Spell.resolveSetup();
  assert.strictEqual(r.kind, 'setup');
  assert.strictEqual(r.playerDamage, 0);
  assert.strictEqual(r.bossDamage, 0);
});

test('S14: hole mayor C D E en C → 2 daño jefe (2×1.0); buff ATQ+ lo sube a 3', () => {
  const r = Spell.resolveHole(played(['C4', 'D4', 'E4']), 'C');
  assert.strictEqual(r.kind, 'hole-spell');
  assert.strictEqual(r.spell.action, 'attack');
  assert.strictEqual(r.bossDamage, 2);
  assert.strictEqual(r.playerDamage, 0);

  const buffed = Spell.resolveHole(
    played(['C4', 'D4', 'E4']),
    'C',
    { buffs: [{ id: 'atk', amount: 0.5, remaining: 2 }] }
  );
  assert.strictEqual(buffed.bossDamage, 3);
});

test('S15: defend C D E E (gesto mayor) no aplica SpellEngine: 0 jefe / 0 buff / 0 cura', () => {
  const expected = [
    { pitch: 'C4', beat: 0, dur: 1 },
    { pitch: 'D4', beat: 1, dur: 1 },
    { pitch: 'E4', beat: 2, dur: 1 },
    { pitch: 'E4', beat: 3, dur: 1 }
  ];
  const r = Spell.resolveDefend(played(['C4', 'D4', 'E4', 'E4']), expected, 'C');
  assert.strictEqual(r.grade, 'perfect');
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.heal, 0);
  assert.strictEqual(r.buff, null);
  assert.strictEqual(r.spell, null);
  assert.strictEqual(r.playerDamage, 0);
});

test('S16: defend Partial (2/4) daña al jugador, no al jefe', () => {
  const r = Spell.resolveDefend(played(['C4', 'C4']), EXPECT_C, 'C');
  assert.strictEqual(r.grade, 'partial');
  assert.strictEqual(r.kind, 'defend-partial');
  assert.strictEqual(r.hits, 2);
  assert.strictEqual(r.bossDamage, 0);
  assert.ok(r.playerDamage > 0);
  assert.ok(r.playerDamage < Spell.MISS_DAMAGE);
  assert.strictEqual(r.playerDamage, 2);
});

test('S17: G mayor en sala C → ×sala 0.85 (1 paso)', () => {
  const s = Spell.classify(['G4', 'B4', 'D4'], 'C');
  assert.strictEqual(s.mode, 'major');
  assert.strictEqual(s.tonic, 'G');
  assert.strictEqual(s.element.id, 'planta');
  assert.strictEqual(s.circleDistance, 1);
  assert.strictEqual(s.multiplier, 0.85);
  const r = Spell.resolveHole(played(['G4', 'B4', 'D4']), 'C');
  assert.strictEqual(r.bossDamage, 2); // round(2*0.85)=2
});

test('S18: tríada mayor C E G es ataque, no cura pentatónica', () => {
  const s = Spell.classify(['C4', 'E4', 'G4'], 'C');
  assert.strictEqual(s.mode, 'major');
  assert.strictEqual(s.action, 'attack');
  const r = Spell.resolveHole(played(['C4', 'E4', 'G4']), 'C');
  assert.strictEqual(r.bossDamage, 2);
  assert.strictEqual(r.heal, 0);
});

test('S20: judgeNoteSync usa 0.15 perfect y el hit 0.45 como partial; fuera es fail', () => {
  assert.strictEqual(Spell.PERFECT_WINDOW_BEATS, 0.15);
  assert.strictEqual(Spell.HIT_WINDOW_BEATS, 0.45);
  assert.strictEqual(Spell.judgeNoteSync(0), 'perfect');
  assert.strictEqual(Spell.judgeNoteSync(0.15), 'perfect');
  assert.strictEqual(Spell.judgeNoteSync(-0.15), 'perfect');
  assert.strictEqual(Spell.judgeNoteSync(0.16), 'partial');
  assert.strictEqual(Spell.judgeNoteSync(0.45), 'partial');
  assert.strictEqual(Spell.judgeNoteSync(-0.45), 'partial');
  assert.strictEqual(Spell.judgeNoteSync(0.46), 'fail');
  assert.strictEqual(Spell.judgeNoteSync(1), 'fail');
  assert.strictEqual(Spell.judgeNoteSync(NaN), 'fail');
});

test('S19: F# mayor en sala C → 6 pasos, ×sala 0, 0 daño', () => {
  const s = Spell.classify(['F#4', 'A#4', 'C#4'], 'C');
  assert.strictEqual(s.tonic, 'F#');
  assert.strictEqual(s.circleDistance, 6);
  assert.strictEqual(s.multiplier, 0);
  const r = Spell.resolveHole(played(['F#4', 'A#4', 'C#4']), 'C');
  assert.strictEqual(r.bossDamage, 0);
  assert.strictEqual(r.playerDamage, 0);
});
