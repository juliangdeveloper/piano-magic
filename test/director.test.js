// test/director.test.js — CombatDirector v0.1.1: Defend copia, Hole DPS, KO.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));
const Director = require(path.join(__dirname, '..', 'js', 'combat', 'director.js'));

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charts', 'raindrops-thunder.json'), 'utf8'));

function make() {
  let t = 0;
  const dir = Director.create({ chart: raw, now: () => t });
  return {
    dir,
    now: () => t,
    set: (ms) => { t = ms; },
    add: (ms) => { t += ms; }
  };
}

function playBar(ctx, startMs, pitches) {
  for (let i = 0; i < pitches.length; i++) {
    ctx.set(startMs + i * 1000 + 20);
    ctx.dir.noteOn(pitches[i], ctx.now());
    ctx.dir.noteOff(pitches[i], ctx.now() + 200);
  }
}

const DEFEND_NOTES = [
  ['C4', 'C4', 'C4', 'C4'],
  ['C4', 'D4', 'E4', 'E4'],
  ['E4', 'D4', 'C4', 'C4'],
  ['C4', 'E4', 'C4', 'E4']
];

test('D0: VERSION 0.1.1', () => {
  assert.strictEqual(Director.VERSION, '0.1.1');
});

test('D1: al empezar, setup listen-only, HP 15/20, BPM 60, sala C = Agua', () => {
  const ctx = make();
  const s = ctx.dir.start(0);
  assert.strictEqual(s.phase, 'setup');
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.bpm, 60);
  assert.strictEqual(s.roomKey, 'C');
  assert.strictEqual(s.roomElement.id, 'agua');
  assert.strictEqual(s.roomElement.label, 'Agua');
  assert.strictEqual(s.currentBar.listenOnly, true);
  assert.strictEqual(s.title, 'Raindrops, Thunder');
  assert.strictEqual(s.version, '0.1.1');
});

test('D2: tocar en setup no cambia HP', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.set(100);
  ctx.dir.noteOn('C4', 100);
  ctx.dir.noteOn('G4', 500);
  ctx.set(4000);
  const s = ctx.dir.tick(4000);
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 20);
  assert.ok(s.lastResolve);
  assert.strictEqual(s.lastResolve.kind, 'setup');
  assert.strictEqual(s.phase, 'hole');
});

test('D3: defend perfecto no hace daño al jefe ni al jugador', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000); // setup → hole
  ctx.dir.tick(8000); // hole idle → first defend
  playBar(ctx, 8000, ['C4', 'C4', 'C4', 'C4']);
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.lastResolve.kind, 'defend-perfect');
  assert.strictEqual(s.lastResolve.grade, 'perfect');
  assert.strictEqual(s.lastResolve.bossDamage, 0);
  assert.strictEqual(s.lastResolve.playerDamage, 0);
  assert.strictEqual(s.lastResolve.heal, 0);
  assert.strictEqual(s.lastResolve.buff, null);
});

test('D4: defend fallido hace 3 al jugador, 0 al jefe', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000); // setup → hole
  ctx.dir.tick(8000); // hole idle → first defend
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.playerHp, 12);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.lastResolve.kind, 'defend-fail');
  assert.strictEqual(s.lastResolve.grade, 'fail');
});

test('D5: agujero en silencio no daña; improvisar mayor pega al jefe, no al jugador', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000); // setup → hole
  let s = ctx.dir.tick(4000);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.playerHp, 15);
  s = ctx.dir.tick(8000);
  assert.strictEqual(s.lastResolve.kind, 'hole-idle');
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.phase, 'defend');

  const ctx2 = make();
  ctx2.dir.start(0);
  ctx2.dir.tick(4000);
  playBar(ctx2, 4000, ['C4', 'D4', 'E4']);
  s = ctx2.dir.tick(8000);
  assert.strictEqual(s.lastResolve.kind, 'hole-spell');
  assert.strictEqual(s.lastResolve.spell.action, 'attack');
  assert.strictEqual(s.lastResolve.playerDamage, 0);
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 18);
  assert.strictEqual(s.outcome, null);
});

test('D6: el loop se repite: tras un ciclo vuelve el agujero', () => {
  const ctx = make();
  ctx.dir.start(0);
  const s = ctx.dir.tick(24000); // after hole+4 defend, bar 6 = hole cycle 1
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.currentBar.loopIndex, 0);
  assert.strictEqual(s.barIndex, 6);
});

test('D7: 10 agujeros mayor (C D E) con defends perfectos derrotan al jefe (20 HP)', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  for (let cycle = 0; cycle < 10; cycle++) {
    const base = 4000 + cycle * 20000;
    playBar(ctx, base, ['C4', 'D4', 'E4']);
    ctx.dir.tick(base + 4000);
    for (let i = 0; i < 4; i++) {
      playBar(ctx, base + 4000 + i * 4000, DEFEND_NOTES[i]);
      ctx.dir.tick(base + 8000 + i * 4000);
    }
  }
  const s = ctx.dir.snapshot(ctx.now());
  assert.strictEqual(s.bossHp, 0);
  assert.strictEqual(s.outcome, 'win');
  assert.strictEqual(s.phase, 'win');
  assert.ok(s.playerHp > 0);
});

test('D8: reset / start otra vez restaura HP y fase', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(12000);
  assert.ok(ctx.dir.snapshot().playerHp < 15);
  ctx.dir.reset();
  const s = ctx.dir.start(0);
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.phase, 'setup');
  assert.strictEqual(s.ended, false);
  assert.strictEqual(s.outcome, null);
});

test('D9: translator convierte 1000ms @60bpm en 1 beat y bar boundaries', () => {
  const ctx = make();
  ctx.dir.start(0);
  const tr = ctx.dir.translator;
  assert.strictEqual(tr.beatsAt(0), 0);
  assert.strictEqual(tr.beatsAt(1000), 1);
  assert.strictEqual(tr.beatsAt(4000), 4);
  const m = tr.measureAt(4500);
  assert.strictEqual(m.barIndex, 1);
  assert.ok(Math.abs(m.beatInBar - 0.5) < 1e-9);
});

test('D10: chart parseado coincide con el archivo canónico', () => {
  const parsed = Chart.parse(raw);
  assert.strictEqual(parsed.hp.player, 15);
  assert.strictEqual(parsed.hp.boss, 20);
  assert.strictEqual(Director.create({ chart: raw }).chart.id, 'raindrops-thunder');
});

test('D11: defend parcial (2/4) daña al jugador, no al jefe', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000); // setup → hole
  ctx.dir.tick(8000); // hole idle → first defend
  playBar(ctx, 8000, ['C4', 'C4']);
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.lastResolve.grade, 'partial');
  assert.strictEqual(s.lastResolve.kind, 'defend-partial');
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.playerHp, 13);
});

test('D12: hole menor aplica buff; el siguiente hole mayor pega más', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000); // setup → hole
  playBar(ctx, 4000, ['C4', 'Eb4', 'G4']);
  let s = ctx.dir.tick(8000);
  assert.strictEqual(s.lastResolve.spell.action, 'buff');
  assert.strictEqual(s.bossHp, 20);
  assert.ok(s.buffs.length >= 1);

  for (let i = 0; i < 4; i++) {
    playBar(ctx, 8000 + i * 4000, DEFEND_NOTES[i]);
    ctx.dir.tick(12000 + i * 4000);
  }
  playBar(ctx, 24000, ['C4', 'D4', 'E4']);
  s = ctx.dir.tick(28000);
  assert.strictEqual(s.lastResolve.spell.action, 'attack');
  assert.strictEqual(s.lastResolve.bossDamage, 3);
  assert.strictEqual(s.bossHp, 17);
  assert.strictEqual(s.playerHp, 15);
});

test('D13: NoteOn en el agujero entra en improvNotes; en setup o defend, no', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.set(200);
  ctx.dir.noteOn('C4', 200);
  let s = ctx.dir.snapshot(200);
  assert.strictEqual(s.improvNotes.length, 0);

  ctx.set(4500);
  ctx.dir.noteOn('E4', 4500);
  ctx.dir.noteOn('G#4', 4700);
  s = ctx.dir.snapshot(4700);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.improvNotes.length, 2);
  assert.strictEqual(s.improvNotes[0].pitch, 'E4');
  assert.ok(Math.abs(s.improvNotes[0].beat - 4.5) < 1e-9);
  assert.strictEqual(s.improvNotes[1].pitch, 'G#4');
  assert.strictEqual(s.improvNotes[0].barIndex, 1);

  ctx.set(9000);
  ctx.dir.tick(9000);
  ctx.dir.noteOn('C4', 9000);
  s = ctx.dir.snapshot(9000);
  assert.strictEqual(s.phase, 'defend');
  assert.strictEqual(s.improvNotes.length, 2);
  assert.ok(s.ribbon.length >= 5);
  assert.strictEqual(s.ribbon[0].globalBar, 0);
});

test('D14: la cinta mira dos compases atrás cuando ya hay historia', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.set(20000);
  const s = ctx.dir.tick(20000);
  assert.strictEqual(s.barIndex, 5);
  assert.strictEqual(s.ribbon[0].globalBar, 3);
  assert.strictEqual(s.playerHp, 6);
  assert.strictEqual(s.bossHp, 20);
});
