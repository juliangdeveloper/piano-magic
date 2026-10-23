// test/meta-proyecto.test.js — bloque proyecto de meta.v1.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Meta = require('../js/meta.js');
const Progress = require('../js/progress.js');

const KEY = 'meta.v1.piano-magic';
const NOW = '2026-10-23T18:00:00.000Z';
const DECLARE = [{ key: 'fights_played', monotonic: true }];

function mem(seed) {
  const data = Object.assign({}, seed || {});
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); }
  };
}

test.beforeEach(() => Meta.metaSetProyecto(null));
test.after(() => Meta.metaSetProyecto(null));

test('PROYECTO es un bloque válido dentro de los rangos', () => {
  assert.deepStrictEqual(Meta.metaProyecto(Meta.PROYECTO), Object.assign({}, Meta.PROYECTO));
  assert.ok(Array.from(Meta.PROYECTO.objetivo).length <= 140);
});

test('el backfill y cada escritura guardan proyecto fuera de stats', () => {
  const storage = mem();
  Progress.backfill('9.9.9', { storage, now: NOW, nowMs: () => 10000 });
  const stored = JSON.parse(storage.getItem(KEY));
  assert.strictEqual(stored.v, 1);
  assert.deepStrictEqual(stored.proyecto, Object.assign({}, Meta.PROYECTO));
  assert.strictEqual('proyecto' in stored.stats, false);
  const rec = Meta.metaUpdate('piano-magic', '9.9.9', { stats: { fights_played: 1 }, logros: [] }, { storage, now: NOW, declare: DECLARE });
  assert.deepStrictEqual(rec.proyecto, Object.assign({}, Meta.PROYECTO));
  assert.deepStrictEqual(JSON.parse(storage.getItem(KEY)).proyecto, rec.proyecto);
});

test('un bloque inválido se omite y nunca lanza', () => {
  const P = Meta.PROYECTO;
  const bad = [
    'x', [], {},
    Object.assign({}, P, { objetivo: '' }),
    Object.assign({}, P, { objetivo: 'a'.repeat(141) }),
    Object.assign({}, P, { objetivo: 5 }),
    Object.assign({}, P, { fase: 0 }), Object.assign({}, P, { fase: 7 }),
    Object.assign({}, P, { fase: 2.5 }), Object.assign({}, P, { fase: '4' }),
    Object.assign({}, P, { fase_estado: -1 }), Object.assign({}, P, { fase_estado: 5 }),
    Object.assign({}, P, { fases_completadas: 7 }), Object.assign({}, P, { fases_completadas: NaN }),
    { get objetivo() { throw new Error('boom'); } }
  ];
  for (const p of bad) {
    assert.strictEqual(Meta.metaProyecto(p), null);
    const storage = mem();
    Meta.metaSetProyecto(p);
    let rec;
    assert.doesNotThrow(() => { rec = Meta.metaUpdate('piano-magic', '9.9.9', { stats: {}, logros: ['first_fight'] }, { storage, now: NOW, declare: DECLARE }); });
    assert.ok(rec);
    const stored = JSON.parse(storage.getItem(KEY));
    assert.strictEqual('proyecto' in stored, false);
    assert.deepStrictEqual(stored.logros, ['first_fight']);
  }
});

test('un registro viejo sin proyecto sigue siendo válido y gana el bloque', () => {
  const old = {
    v: 1, slug: 'piano-magic', version: '0.1.32', updatedAt: '2026-01-01T00:00:00.000Z',
    stats: { fights_played: 3 }, logros: ['first_fight'], hitos: { first_fight: '2026-01-01T00:00:00.000Z' }
  };
  const raw = JSON.stringify(old);
  const storage = mem({ [KEY]: raw });
  Progress.backfill('9.9.9', { storage, now: NOW, nowMs: () => 10000 });
  assert.strictEqual(storage.getItem(KEY), raw);
  assert.strictEqual(storage.getItem(KEY + '.corrupt'), null);
  const rec = Meta.metaUpdate('piano-magic', '9.9.9', { stats: {}, logros: [] }, { storage, now: NOW, declare: DECLARE });
  assert.strictEqual(rec.hitos.first_fight, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(rec.stats.fights_played, 3);
  assert.deepStrictEqual(rec.proyecto, Object.assign({}, Meta.PROYECTO));
});
