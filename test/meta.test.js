// test/meta.test.js — registro meta.v1.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const Meta = require('../js/meta.js');

function mem() {
  const data = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); }
  };
}

function read(storage) {
  return JSON.parse(storage.getItem('meta.v1.piano-magic'));
}

test('metaUpdate escribe la forma, funde stats y no borra claves', () => {
  const storage = mem();
  const now = '2026-10-23T18:00:00.000Z';
  const first = Meta.metaUpdate('piano-magic', '0.1.30', {
    stats: { fights_won: 1, fights_played: 2, note: 'no' },
    logros: ['first_win', 'first_fight']
  }, { storage, now });
  assert.deepStrictEqual(Object.keys(first), ['v', 'slug', 'version', 'updatedAt', 'stats', 'logros', 'hitos']);
  assert.strictEqual(first.v, 1);
  assert.strictEqual(first.slug, 'piano-magic');
  assert.strictEqual(first.version, '0.1.30');
  assert.strictEqual(first.updatedAt, now);
  assert.deepStrictEqual(first.stats, { fights_won: 1, fights_played: 2 });
  assert.deepStrictEqual(first.logros, ['first_fight', 'first_win']);
  assert.deepStrictEqual(first.hitos, { first_fight: now, first_win: now });

  const later = '2026-10-23T19:00:00.000Z';
  const second = Meta.metaUpdate('piano-magic', '0.1.30', {
    stats: { fights_won: NaN, fights_played: Infinity, best_accuracy_pct: 80, label: 'x' },
    logros: ['first_win', 'perfect_fight', 'perfect_fight']
  }, { storage, now: later });
  assert.strictEqual(second.stats.fights_won, 1);
  assert.strictEqual(second.stats.fights_played, 2);
  assert.strictEqual(second.stats.best_accuracy_pct, 80);
  assert.strictEqual(second.stats.label, undefined);
  assert.deepStrictEqual(second.logros, ['first_fight', 'first_win', 'perfect_fight']);
  assert.strictEqual(second.hitos.first_win, now);
  assert.strictEqual(second.hitos.first_fight, now);
  assert.strictEqual(second.hitos.perfect_fight, later);
  assert.deepStrictEqual(read(storage), second);
});

test('metaUpdate respeta el tope de 20 claves y un JSON roto no lanza', () => {
  const storage = mem();
  const stats = {};
  for (let i = 0; i < 20; i++) stats['k' + i] = i;
  Meta.metaUpdate('piano-magic', '0.1.30', { stats }, { storage, now: '2026-10-23T18:00:00.000Z' });
  const capped = Meta.metaUpdate('piano-magic', '0.1.30', {
    stats: { k0: 7, fresh: 1 }
  }, { storage, now: '2026-10-23T18:00:01.000Z' });
  assert.strictEqual(Object.keys(capped.stats).length, 20);
  assert.strictEqual(capped.stats.k0, 7);
  assert.strictEqual(capped.stats.fresh, undefined);

  storage.setItem('meta.v1.piano-magic', '{');
  let thrown = false;
  let fresh = null;
  try {
    fresh = Meta.metaUpdate('piano-magic', '0.1.30', {
      stats: { fights_won: 3 },
      logros: ['first_win']
    }, { storage, now: '2026-10-23T18:00:02.000Z' });
  } catch (e) {
    thrown = true;
  }
  assert.strictEqual(thrown, false);
  assert.strictEqual(fresh.stats.fights_won, 3);
  assert.deepStrictEqual(fresh.logros, ['first_win']);
  assert.strictEqual(fresh.hitos.first_win, '2026-10-23T18:00:02.000Z');
});

test('metaUpdate avisa al padre y calla en la ventana propia', () => {
  const prevWindow = global.window;
  const prevLocation = global.location;
  try {
    const posted = [];
    const parent = {
      postMessage(data, origin) { posted.push({ data, origin }); }
    };
    global.window = { parent };
    global.location = { origin: 'https://example.test' };
    const storage = mem();
    Meta.metaUpdate('piano-magic', '0.1.30', { stats: { fights_played: 1 } }, {
      storage,
      now: '2026-10-23T18:00:00.000Z'
    });
    assert.strictEqual(posted.length, 1);
    assert.strictEqual(posted[0].origin, 'https://example.test');
    assert.strictEqual(posted[0].data.type, 'meta');
    assert.strictEqual(posted[0].data.key, 'meta.v1.piano-magic');
    assert.strictEqual(posted[0].data.data.slug, 'piano-magic');
    assert.strictEqual(posted[0].data.data.stats.fights_played, 1);

    posted.length = 0;
    global.window = { parent: null };
    global.window.parent = global.window;
    Meta.metaUpdate('piano-magic', '0.1.30', { stats: { fights_played: 2 } }, {
      storage,
      now: '2026-10-23T18:00:01.000Z'
    });
    assert.strictEqual(posted.length, 0);

    global.window = {
      parent: {
        postMessage() { throw new Error('cerrado'); }
      }
    };
    let threw = false;
    try {
      Meta.metaUpdate('piano-magic', '0.1.30', { stats: { fights_played: 3 } }, { storage });
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, false);
    assert.strictEqual(read(storage).stats.fights_played, 3);
  } finally {
    if (prevWindow === undefined) delete global.window;
    else global.window = prevWindow;
    if (prevLocation === undefined) delete global.location;
    else global.location = prevLocation;
  }
});

test('un id que solo está en hitos entra en logros', () => {
  const storage = mem();
  storage.setItem('meta.v1.piano-magic', JSON.stringify({
    v: 1,
    slug: 'piano-magic',
    version: '0.1.29',
    updatedAt: '2026-10-20T00:00:00.000Z',
    stats: { fights_won: 1 },
    logros: [],
    hitos: { first_win: '2026-10-20T00:00:00.000Z' }
  }));
  const rec = Meta.metaUpdate('piano-magic', '0.1.30', { stats: { fights_won: 2 } }, {
    storage,
    now: '2026-10-23T18:00:00.000Z'
  });
  assert.deepStrictEqual(rec.logros, ['first_win']);
  assert.strictEqual(rec.hitos.first_win, '2026-10-20T00:00:00.000Z');
  assert.strictEqual(rec.stats.fights_won, 2);
});
