// test/director.test.js — CombatDirector: setup, loop, KO, restart.
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

test('D0: VERSION 0.1.0', () => {
  assert.strictEqual(Director.VERSION, '0.1.0');
});

test('D1: al empezar, setup listen-only, HP 15/20, BPM 60, sala C', () => {
  const ctx = make();
  const s = ctx.dir.start(0);
  assert.strictEqual(s.phase, 'setup');
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.bpm, 60);
  assert.strictEqual(s.roomKey, 'C');
  assert.strictEqual(s.roomElement.id, 'tierra');
  assert.strictEqual(s.currentBar.listenOnly, true);
  assert.strictEqual(s.title, 'Raindrops, Thunder');
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
  assert.strictEqual(s.phase, 'defend');
});

test('D3: defend 0 perfecto (CCCC) hace 3 al jefe', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  playBar(ctx, 4000, ['C4', 'C4', 'C4', 'C4']);
  const s = ctx.dir.tick(8000);
  assert.strictEqual(s.bossHp, 17);
  assert.strictEqual(s.playerHp, 15);
  assert.strictEqual(s.lastResolve.kind, 'defend-hit');
  assert.strictEqual(s.lastResolve.bossDamage, 3);
});

test('D4: defend fallido hace 3 al jugador', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  const s = ctx.dir.tick(8000);
  assert.strictEqual(s.playerHp, 12);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.lastResolve.kind, 'defend-miss');
});

test('D5: agujero en silencio no daña; notas en agujero sí', () => {
  const ctx = make();
  ctx.dir.start(0);
  // skip 4 defends without playing → player 15-12=3, then hole
  ctx.dir.tick(4000);
  ctx.dir.tick(8000);
  ctx.dir.tick(12000);
  ctx.dir.tick(16000);
  ctx.dir.tick(20000);
  let s = ctx.dir.tick(20000);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.playerHp, 3);
  s = ctx.dir.tick(24000);
  assert.strictEqual(s.lastResolve.kind, 'hole-clear');
  assert.strictEqual(s.playerHp, 3);

  const ctx2 = make();
  ctx2.dir.start(0);
  ctx2.dir.tick(20000);
  ctx2.set(20100);
  ctx2.dir.noteOn('C4', 20100);
  s = ctx2.dir.tick(24000);
  assert.strictEqual(s.lastResolve.kind, 'hole-miss');
  assert.strictEqual(s.playerHp, 0);
  assert.strictEqual(s.outcome, 'lose');
  assert.strictEqual(s.phase, 'lose');
});

test('D6: el loop se repite tras el hole', () => {
  const ctx = make();
  ctx.dir.start(0);
  const s = ctx.dir.tick(24000); // after hole, bar 6 = defend i=0
  assert.strictEqual(s.phase, 'defend');
  assert.strictEqual(s.currentBar.loopIndex, 0);
  assert.strictEqual(s.barIndex, 6);
});

test('D7: siete defends perfectos (notas del chart) derrotan al jefe (20 HP)', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  const bars = [
    { start: 4000, notes: ['C4', 'C4', 'C4', 'C4'] },
    { start: 8000, notes: ['C4', 'D4', 'E4', 'E4'] },
    { start: 12000, notes: ['E4', 'D4', 'C4', 'C4'] },
    { start: 16000, notes: ['C4', 'E4', 'C4', 'E4'] },
    { start: 24000, notes: ['C4', 'C4', 'C4', 'C4'] },
    { start: 28000, notes: ['C4', 'D4', 'E4', 'E4'] },
    { start: 32000, notes: ['E4', 'D4', 'C4', 'C4'] }
  ];
  for (const bar of bars) {
    playBar(ctx, bar.start, bar.notes);
    ctx.dir.tick(bar.start + 4000);
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
  ctx.dir.tick(8000);
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
