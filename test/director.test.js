'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Chart = require(path.join(__dirname, '..', 'js', 'combat', 'chart.js'));
const Director = require(path.join(__dirname, '..', 'js', 'combat', 'director.js'));
const FULL_HP = Chart.PLAYER_HP;

function n(pitch, beat) {
  return { pitch, beat, dur: 1 };
}

const raw = {
  id: 'sala-c',
  title: 'Sala C',
  bpm: 60,
  timeSig: [4, 4],
  roomKey: 'C',
  roomScale: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  setup: { listenOnly: true, bars: 1 },
  loop: [
    { i: 0, kind: 'hole', notes: [] },
    { i: 1, kind: 'defend', notes: [n('C4', 0), n('C4', 1), n('C4', 2), n('C4', 3)] },
    { i: 2, kind: 'defend', notes: [n('C4', 0), n('D4', 1), n('E4', 2), n('E4', 3)] },
    { i: 3, kind: 'defend', notes: [n('E4', 0), n('D4', 1), n('C4', 2), n('C4', 3)] },
    { i: 4, kind: 'defend', notes: [n('C4', 0), n('E4', 1), n('C4', 2), n('E4', 3)] }
  ],
  hp: { player: 15, boss: 20 }
};

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

function playBar(ctx, startMs, pitches, onCenter) {
  const shift = onCenter ? 500 : 0;
  for (let i = 0; i < pitches.length; i++) {
    ctx.set(startMs + i * 1000 + shift + 20);
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

test('D1: al empezar, setup listen-only, HP del override y jefe 20, BPM 60, sala C = Agua', () => {
  const ctx = make();
  const s = ctx.dir.start(0);
  assert.strictEqual(s.phase, 'setup');
  assert.strictEqual(s.playerHp, FULL_HP);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.bpm, 60);
  assert.strictEqual(s.roomKey, 'C');
  assert.strictEqual(s.roomElement.id, 'agua');
  assert.strictEqual(s.roomElement.label, 'Agua');
  assert.strictEqual(s.currentBar.listenOnly, true);
  assert.strictEqual(s.title, 'Sala C');
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
  assert.strictEqual(s.playerHp, FULL_HP);
  assert.strictEqual(s.bossHp, 20);
  assert.ok(s.lastResolve);
  assert.strictEqual(s.lastResolve.kind, 'setup');
  assert.strictEqual(s.phase, 'hole');
});

test('D3: defend perfecto no hace daño al jefe ni al jugador', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  ctx.dir.tick(8000);
  playBar(ctx, 8000, ['C4', 'C4', 'C4', 'C4'], true);
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.playerHp, FULL_HP);
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
  ctx.dir.tick(4000);
  ctx.dir.tick(8000);
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.playerHp, FULL_HP - 3);
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.lastResolve.kind, 'defend-fail');
  assert.strictEqual(s.lastResolve.grade, 'fail');
});

test('D5: agujero en silencio no daña; improvisar mayor pega al jefe, no al jugador', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  let s = ctx.dir.tick(4000);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.playerHp, FULL_HP);
  s = ctx.dir.tick(8000);
  assert.strictEqual(s.lastResolve.kind, 'hole-idle');
  assert.strictEqual(s.playerHp, FULL_HP);
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
  assert.strictEqual(s.playerHp, FULL_HP);
  assert.strictEqual(s.bossHp, 18);
  assert.strictEqual(s.outcome, null);
});

test('D6: el loop se repite: tras un ciclo vuelve el agujero', () => {
  const ctx = make();
  ctx.dir.start(0);
  const s = ctx.dir.tick(24000);
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
      playBar(ctx, base + 4000 + i * 4000, DEFEND_NOTES[i], true);
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
  assert.ok(ctx.dir.snapshot().playerHp < FULL_HP);
  ctx.dir.reset();
  const s = ctx.dir.start(0);
  assert.strictEqual(s.playerHp, FULL_HP);
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

test('D10: el override pisa el HP del jugador; el jefe y el id quedan', () => {
  const parsed = Chart.parse(raw);
  assert.strictEqual(FULL_HP, 1000);
  assert.strictEqual(raw.hp.player, 15);
  assert.strictEqual(parsed.hp.player, FULL_HP);
  assert.strictEqual(parsed.hp.boss, 20);
  assert.strictEqual(Director.create({ chart: raw }).chart.id, 'sala-c');
});

test('D11: defend parcial (2/4) daña al jugador, no al jefe', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  ctx.dir.tick(8000);
  playBar(ctx, 8000, ['C4', 'C4'], true);
  const s = ctx.dir.tick(12000);
  assert.strictEqual(s.lastResolve.grade, 'partial');
  assert.strictEqual(s.lastResolve.kind, 'defend-partial');
  assert.strictEqual(s.bossHp, 20);
  assert.strictEqual(s.playerHp, FULL_HP - 2);
});

test('D12: hole menor aplica buff; el siguiente hole mayor pega más', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.tick(4000);
  playBar(ctx, 4000, ['C4', 'Eb4', 'G4']);
  let s = ctx.dir.tick(8000);
  assert.strictEqual(s.lastResolve.spell.action, 'buff');
  assert.strictEqual(s.bossHp, 20);
  assert.ok(s.buffs.length >= 1);

  for (let i = 0; i < 4; i++) {
    playBar(ctx, 8000 + i * 4000, DEFEND_NOTES[i], true);
    ctx.dir.tick(12000 + i * 4000);
  }
  playBar(ctx, 24000, ['C4', 'D4', 'E4']);
  s = ctx.dir.tick(28000);
  assert.strictEqual(s.lastResolve.spell.action, 'attack');
  assert.strictEqual(s.lastResolve.bossDamage, 3);
  assert.strictEqual(s.bossHp, 17);
  assert.strictEqual(s.playerHp, FULL_HP);
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

test('D15: la pausa congela el beat; continuar no salta compases ni resuelve de más', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.dir.pause(3900);
  let s = ctx.dir.tick(20000);
  assert.strictEqual(s.paused, true);
  assert.ok(Math.abs(s.beat - 3.9) < 1e-9);
  assert.strictEqual(s.phase, 'setup');
  assert.strictEqual(s.lastResolve, null);
  assert.strictEqual(s.playerHp, FULL_HP);
  ctx.dir.noteOn('E4', 15000);
  s = ctx.dir.snapshot(20000);
  assert.strictEqual(s.improvNotes.length, 0);
  assert.strictEqual(s.defendNotes.length, 0);
  ctx.dir.resume(20000);
  s = ctx.dir.snapshot(20000);
  assert.strictEqual(s.paused, false);
  assert.ok(Math.abs(s.beat - 3.9) < 1e-9);
  s = ctx.dir.tick(20200);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.lastResolve.kind, 'setup');
  assert.ok(Math.abs(s.beat - 4.1) < 1e-9);
  assert.strictEqual(s.playerHp, FULL_HP);
  assert.strictEqual(s.bossHp, 20);
});

test('D16: en Defend la nota del jugador queda en defendNotes con sync; el hole sigue solo en improvNotes', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.set(8000);
  ctx.dir.noteOn('C4', 8000);
  let s = ctx.dir.snapshot(8000);
  assert.strictEqual(s.defendNotes[0].sync, 'fail', 'la barra no es el centro del tiempo');

  ctx.set(8520);
  ctx.dir.noteOn('C4', 8520);
  s = ctx.dir.snapshot(8520);
  assert.strictEqual(s.phase, 'defend');
  assert.strictEqual(s.improvNotes.length, 0);
  assert.strictEqual(s.defendNotes.length, 2);
  assert.strictEqual(s.defendNotes[1].pitch, 'C4');
  assert.strictEqual(s.defendNotes[1].sync, 'perfect');
  assert.ok(Math.abs(s.defendNotes[1].targetBeat - 8.5) < 1e-9);
  assert.ok(s.defendNotes[1].error < 0.15);

  ctx.dir.noteOn('C4', 9900);
  s = ctx.dir.snapshot(9900);
  assert.strictEqual(s.defendNotes.length, 3);
  assert.strictEqual(s.defendNotes[2].sync, 'partial');
  assert.ok(Math.abs(s.defendNotes[2].targetBeat - 9.5) < 1e-9);

  ctx.dir.noteOn('G4', 10520);
  s = ctx.dir.snapshot(10520);
  assert.strictEqual(s.defendNotes[3].sync, 'fail');
  assert.strictEqual(s.defendNotes[3].targetBeat, null);
  assert.strictEqual(s.improvNotes.length, 0);

  ctx.dir.noteOn('C4', 11520);
  ctx.dir.noteOn('C4', 12520);
  s = ctx.dir.snapshot(12520);
  assert.strictEqual(s.defendNotes.filter((n) => n.sync === 'perfect').length, 3);
});

test('D18: el beat no salta al pasar de Ataque a Defiende', () => {
  const ctx = make();
  ctx.dir.start(0);
  const a = ctx.dir.tick(7990);
  const b = ctx.dir.tick(8010);
  assert.strictEqual(a.phase, 'hole');
  assert.strictEqual(b.phase, 'defend');
  assert.ok(Math.abs((b.beat - a.beat) - 0.02) < 1e-9);
  assert.strictEqual(b.barIndex, a.barIndex + 1);
  assert.strictEqual(b.currentBar.startBeat, 8);
});

test('D17: el feedback del hole dice Ataque', () => {
  const ctx = make();
  ctx.dir.start(0);
  const s = ctx.dir.tick(8000);
  assert.strictEqual(s.phase, 'defend');
  assert.strictEqual(s.lastResolve.kind, 'hole-idle');
  assert.strictEqual(s.feedback, 'Ataque · libre');
});

test('D14: la cinta mira dos compases atrás cuando ya hay historia', () => {
  const ctx = make();
  ctx.dir.start(0);
  ctx.set(20000);
  const s = ctx.dir.tick(20000);
  assert.strictEqual(s.barIndex, 5);
  assert.strictEqual(s.ribbon[0].globalBar, 3);
  assert.strictEqual(s.playerHp, FULL_HP - 9);
  assert.strictEqual(s.bossHp, 20);
});

test('D19: un par en voices es perfecto; una sola voz es parcial; el segundo evento no duplica', () => {
  const chord = JSON.parse(JSON.stringify(raw));
  chord.loop[1].notes = [
    { pitch: 'C4', beat: 0, dur: 1, hand: 'R' },
    { pitch: 'C3', beat: 0, dur: 1, hand: 'L' }
  ];
  let t = 0;
  const both = Director.create({ chart: chord, now: () => t });
  both.start(0);
  const voices = [{ pitch: 'C3', midi: 48 }, { pitch: 'C4', midi: 60 }];
  t = 8520;
  both.noteOn('C4', 8520, voices);
  both.noteOn('C3', 8520, voices);
  let s = both.snapshot(8520);
  assert.strictEqual(s.defendNotes.length, 2);
  assert.ok(s.defendNotes.every((n) => n.sync === 'perfect'));
  assert.deepStrictEqual(s.defendNotes.map((n) => n.hand).sort(), ['L', 'R']);
  t = 12000;
  s = both.tick(12000);
  assert.strictEqual(s.lastResolve.grade, 'perfect');
  assert.strictEqual(s.playerHp, FULL_HP);

  t = 0;
  const one = Director.create({ chart: chord, now: () => t });
  one.start(0);
  t = 8520;
  one.noteOn('C4', 8520, [{ pitch: 'C4' }]);
  t = 12000;
  s = one.tick(12000);
  assert.strictEqual(s.lastResolve.grade, 'partial');
  assert.strictEqual(s.playerHp, FULL_HP - 2);
});

test('D20: Tower Chime se recorre entero: ataques tras 7 y 14, silencio sin daño, campana E3', () => {
  const chart = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charts', 'tower-chime.json'), 'utf8'));
  let t = 0;
  const dir = Director.create({ chart: chart, now: () => t });
  dir.start(0);
  const bpb = 3;
  const ms = 1000;
  const holes = [];
  const total = 1 + chart.loop.length;
  for (let g = 0; g < total; g++) {
    t = g * bpb * ms + 20;
    let s = dir.tick(t);
    if (s.phase === 'hole') holes.push(g);
    if (s.phase !== 'defend') continue;
    for (const note of s.currentBar.notes) {
      t = (s.currentBar.startBeat + note.beat + 0.5) * ms;
      dir.noteOn(note.pitch, t);
      dir.noteOff(note.pitch, t + 80);
    }
  }
  t = total * bpb * ms + 20;
  const end = dir.tick(t);
  assert.deepStrictEqual(holes, [8, 16]);
  assert.strictEqual(end.playerHp, FULL_HP);
  assert.strictEqual(end.bossHp, 20);
  assert.strictEqual(end.lastResolve.grade, 'perfect');
  const bell = chart.loop[chart.loop.length - 1];
  assert.strictEqual(bell.kind, 'defend');
  assert.strictEqual(bell.notes[0].pitch, 'E3');
  assert.strictEqual(bell.notes[0].hand, 'L');
});
