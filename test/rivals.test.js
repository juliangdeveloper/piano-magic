'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Rivals = require('../js/combat/rivals.js');
const Chart = require('../js/combat/chart.js');
const Director = require('../js/combat/director.js');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'charts', 'raindrops-thunder.json'), 'utf8'));

test('options: cada rival tiene chart existente y Modo libre va al final', () => {
  const o = Rivals.options();
  assert.strictEqual(o[o.length - 1].id, 'libre');
  assert.ok(o[o.length - 1].free);
  for (const r of o) assert.ok(fs.existsSync(path.join(__dirname, '..', r.chart)), r.chart);
  assert.strictEqual(Rivals.find('nada').id, o[0].id);
});

test('freeChart: solo Ataque, sin Defiende, chart válido', () => {
  const c = Chart.parse(Rivals.freeChart(raw));
  assert.deepStrictEqual(c.loop.map(b => b.kind), ['hole']);
  for (let i = 1; i < 12; i++) assert.notStrictEqual(Chart.barAt(c, i).kind, 'defend');
  assert.strictEqual(raw.loop.length, 5, 'no muta el chart base');
});

function attackBar(dir, setT, startMs) {
  ['G4', 'A4', 'B4'].forEach((p, i) => {
    setT(startMs + i * 300 + 20);
    dir.noteOn(p, startMs + i * 300 + 20);
    dir.noteOff(p, startMs + i * 300 + 200);
  });
}

test('director free: acumula daño, nunca termina, HP intactos', () => {
  let t = 0;
  const dir = Director.create({ chart: Rivals.freeChart(raw), free: true, now: () => t });
  dir.start(0);
  let s;
  for (let bar = 1; bar < 40; bar++) {
    attackBar(dir, v => { t = v; }, bar * 4000);
    t = (bar + 1) * 4000 + 10;
    s = dir.tick(t);
  }
  assert.strictEqual(s.free, true);
  assert.strictEqual(s.ended, false);
  assert.strictEqual(s.phase, 'hole');
  assert.strictEqual(s.playerHp, s.playerHpMax);
  assert.strictEqual(s.bossHp, s.bossHpMax);
  assert.ok(s.damage.total > 0, 'hay daño');
  assert.ok(s.damage.hits >= 1);
  assert.ok(s.damage.max >= s.damage.last && s.damage.max > 0);
  assert.ok(s.damage.dps > 0);
  dir.reset();
  assert.strictEqual(dir.snapshot(0).damage.total, 0);
});

test('director normal: el modo libre no cambia el combate', () => {
  const dir = Director.create({ chart: raw, now: () => 0 });
  const s = dir.snapshot(0);
  assert.strictEqual(s.free, false);
  assert.strictEqual(s.damage.total, 0);
});
