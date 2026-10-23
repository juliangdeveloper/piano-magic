// test/meta.test.js — registro meta.v1.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Meta = require('../js/meta.js');

const DECLARE = [
  { key: 'fights_played', monotonic: true },
  { key: 'fights_won', monotonic: true },
  { key: 'best_accuracy_pct', monotonic: true },
  { key: 'guests_now', monotonic: false }
];

function mem() {
  const data = {};
  const writes = [];
  return {
    writes,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { writes.push(k); data[k] = String(v); }
  };
}

function read(storage) {
  return JSON.parse(storage.getItem('meta.v1.piano-magic'));
}

test('metaUpdate escribe la forma, funde por clave y ordena los logros', () => {
  const storage = mem();
  const now = '2026-10-23T18:00:00.000Z';
  const first = Meta.metaUpdate('piano-magic', 'v0.1.31', {
    stats: { fights_won: 1, fights_played: 2, note: 'no', guests_now: 4 },
    logros: ['first_win', 'first_fight']
  }, { storage, now, declare: DECLARE });
  assert.deepStrictEqual(Object.keys(first), ['v', 'slug', 'version', 'updatedAt', 'stats', 'logros', 'hitos']);
  assert.strictEqual(first.v, 1);
  assert.strictEqual(first.slug, 'piano-magic');
  assert.strictEqual(first.version, '0.1.31');
  assert.strictEqual(first.updatedAt, now);
  assert.deepStrictEqual(Object.keys(first.stats), ['fights_played', 'fights_won', 'guests_now']);
  assert.strictEqual(first.stats.note, undefined);
  assert.deepStrictEqual(first.logros, ['first_fight', 'first_win']);
  assert.deepStrictEqual(first.hitos, { first_fight: now, first_win: now });

  const later = '2026-10-23T19:00:00.000Z';
  const second = Meta.metaUpdate('piano-magic', '0.1.31', {
    stats: { fights_won: NaN, fights_played: Infinity, best_accuracy_pct: 80, guests_now: 1 },
    logros: ['first_win', 'perfect_fight', 'perfect_fight']
  }, { storage, now: later, declare: DECLARE });
  assert.strictEqual(second.stats.fights_won, 1);
  assert.strictEqual(second.stats.fights_played, 2);
  assert.strictEqual(second.stats.best_accuracy_pct, 80);
  assert.strictEqual(second.stats.guests_now, 1);
  assert.deepStrictEqual(second.logros, ['first_fight', 'first_win', 'perfect_fight']);
  assert.strictEqual(second.hitos.first_win, now);
  assert.strictEqual(second.hitos.perfect_fight, later);
  assert.deepStrictEqual(read(storage), second);
});

test('el tope son las 20 primeras claves declaradas y las monótonas no bajan', () => {
  const declare = [];
  for (let i = 0; i < 21; i++) declare.push({ key: 'k' + i, monotonic: i === 0 });
  const storage = mem();
  const stats = {};
  declare.forEach((item, i) => { stats[item.key] = i + 1; });
  stats.extra = 9;
  const first = Meta.metaUpdate('piano-magic', '0.1.31', { stats }, {
    storage,
    now: '2026-10-23T18:00:00.000Z',
    declare
  });
  assert.strictEqual(Object.keys(first.stats).length, 20);
  assert.deepStrictEqual(Object.keys(first.stats), declare.slice(0, 20).map((item) => item.key));
  assert.strictEqual(first.stats.extra, undefined);
  assert.strictEqual(first.stats.k20, undefined);

  const second = Meta.metaUpdate('piano-magic', '0.1.31', {
    stats: { k0: 0, k1: 50, omitted: 1 }
  }, { storage, now: '2026-10-23T18:00:01.000Z', declare });
  assert.strictEqual(second.stats.k0, 1);
  assert.strictEqual(second.stats.k1, 50);
  assert.strictEqual(second.stats.k2, 3);
  assert.strictEqual(second.stats.omitted, undefined);
  assert.strictEqual(Object.keys(second.stats).length, 20);
});

test('un registro roto se copia y se rehace sin lanzar', () => {
  const storage = mem();
  storage.setItem('meta.v1.piano-magic', '{');
  storage.writes.length = 0;
  let thrown = false;
  let fresh = null;
  try {
    fresh = Meta.metaUpdate('piano-magic', '0.1.31', {
      stats: { fights_won: 3 },
      logros: ['first_win']
    }, { storage, now: '2026-10-23T18:00:02.000Z', declare: DECLARE });
  } catch (e) {
    thrown = true;
  }
  assert.strictEqual(thrown, false);
  assert.strictEqual(storage.getItem('meta.v1.piano-magic.corrupt'), '{');
  assert.strictEqual(fresh.stats.fights_won, 3);
  assert.deepStrictEqual(fresh.logros, ['first_win']);
  assert.strictEqual(fresh.hitos.first_win, '2026-10-23T18:00:02.000Z');

  const bad = mem();
  const raw = JSON.stringify({ v: 2, slug: 'otro', stats: { fights_won: 9 }, logros: ['first_win'], hitos: { first_win: '2020-01-01T00:00:00.000Z' } });
  bad.setItem('meta.v1.piano-magic', raw);
  const rebuilt = Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 1 } }, {
    storage: bad,
    now: '2026-10-23T18:00:03.000Z',
    declare: DECLARE
  });
  assert.strictEqual(bad.getItem('meta.v1.piano-magic.corrupt'), raw);
  assert.strictEqual(rebuilt.stats.fights_won, undefined);
  assert.strictEqual(rebuilt.stats.fights_played, 1);
  assert.deepStrictEqual(rebuilt.logros, []);
});

test('metaUpdate avisa al padre una vez por escritura y calla en demo', () => {
  const posted = [];
  const parent = { postMessage(data, origin) { posted.push({ data, origin }); } };
  const view = { parent };
  const storage = mem();
  const opts = {
    storage,
    now: '2026-10-23T18:00:00.000Z',
    declare: DECLARE,
    window: view,
    location: { origin: 'https://example.test' }
  };
  Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 1 } }, opts);
  assert.strictEqual(posted.length, 1);
  assert.strictEqual(posted[0].origin, 'https://example.test');
  assert.strictEqual(posted[0].data.type, 'meta');
  assert.strictEqual(posted[0].data.key, 'meta.v1.piano-magic');
  assert.strictEqual(posted[0].data.data.stats.fights_played, 1);

  posted.length = 0;
  Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 2 } }, Object.assign({}, opts, {
    window: { parent: null }
  }));
  const own = {};
  own.parent = own;
  Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 2 } }, Object.assign({}, opts, { window: own }));
  assert.strictEqual(posted.length, 0);

  posted.length = 0;
  const before = storage.writes.length;
  const demo = Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 9 } }, Object.assign({}, opts, { demo: true }));
  assert.strictEqual(demo, null);
  assert.strictEqual(posted.length, 0);
  assert.strictEqual(storage.writes.length, before);
  assert.strictEqual(read(storage).stats.fights_played, 2);

  const preview = mem();
  assert.strictEqual(Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_played: 1 } }, {
    storage: preview,
    declare: DECLARE,
    search: '?preview=1',
    window: view
  }), null);
  assert.strictEqual(preview.getItem('meta.v1.piano-magic'), null);
  assert.strictEqual(posted.length, 0);
});

test('un id que solo está en hitos entra en logros', () => {
  const storage = mem();
  storage.setItem('meta.v1.piano-magic', JSON.stringify({
    v: 1,
    slug: 'piano-magic',
    version: '0.1.29',
    updatedAt: '2026-10-20T00:00:00.000Z',
    stats: { fights_won: 4 },
    logros: [],
    hitos: { first_win: '2026-10-20T00:00:00.000Z' }
  }));
  const rec = Meta.metaUpdate('piano-magic', '0.1.31', { stats: { fights_won: 2 } }, {
    storage,
    now: '2026-10-23T18:00:00.000Z',
    declare: DECLARE
  });
  assert.deepStrictEqual(rec.logros, ['first_win']);
  assert.strictEqual(rec.hitos.first_win, '2026-10-20T00:00:00.000Z');
  assert.strictEqual(rec.stats.fights_won, 4);
});
