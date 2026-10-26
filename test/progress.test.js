'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Chart = require('../js/combat/chart.js');
const Meta = require('../js/meta.js');
const Progress = require('../js/progress.js');

const NOW = '2026-10-23T18:00:00.000Z';
const KEY = 'meta.v1.piano-magic';

function mem(seed) {
  const data = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); }
  };
}

function record(storage) {
  return JSON.parse(storage.getItem(KEY));
}

function tinyChart() {
  return Chart.parse({
    id: 'parade-feather',
    title: 't',
    bpm: 60,
    timeSig: [4, 4],
    roomKey: 'C',
    setup: { bars: 1 },
    loop: [
      { kind: 'hole', notes: [] },
      { kind: 'defend', notes: [{ pitch: 'C4', beat: 0 }, { pitch: 'D4', beat: 1 }] }
    ],
    hp: { player: 15, boss: 20 }
  });
}

function ended(outcome, notes, extra) {
  return Object.assign({
    ended: true,
    outcome,
    free: false,
    barIndex: 3,
    defendNotes: notes,
    damage: { total: 12 }
  }, extra || {});
}

test('las claves y los ids quedan fijos', () => {
  assert.deepStrictEqual(Progress.STAT_KEYS, [
    'fights_played',
    'fights_won',
    'fights_lost',
    'perfect_notes_total',
    'bosses_defeated',
    'best_accuracy_pct',
    'perfect_fights',
    'damage_total',
    'parade_feather_wins',
    'veil_boat_wins',
    'tower_chime_wins',
    'new_world_largo_wins',
    'camptown_races_wins',
    'eine_kleine_wins'
  ]);
  assert.deepStrictEqual(Progress.ACHIEVEMENTS.map((a) => a.id), [
    'first_fight',
    'first_win',
    'boss_parade_feather',
    'boss_veil_boat',
    'boss_tower_chime',
    'boss_new_world_largo',
    'boss_camptown_races',
    'boss_eine_kleine',
    'perfect_fight',
    'perfect_notes_50',
    'all_bosses',
    'fights_10'
  ]);
  assert.ok(Progress.ACHIEVEMENTS.length >= 5 && Progress.ACHIEVEMENTS.length <= 12);
  assert.strictEqual(Progress.SLUG, 'piano-magic');
  assert.ok(Progress.STAT_KEYS.length <= 20);
  assert.deepStrictEqual(Object.keys(Progress.STATS), Progress.STAT_KEYS);
  assert.ok(Progress.STAT_KEYS.every((key) => Meta.statConservaMaximo(Progress.STATS[key].tipo)));
});

test('las condiciones de cada logro', () => {
  const z = {};
  assert.deepStrictEqual(Progress.unlocked(z), []);
  assert.deepStrictEqual(Progress.unlocked({ fights_played: 1 }), ['first_fight']);
  assert.ok(Progress.unlocked({ fights_won: 1 }).includes('first_win'));
  assert.ok(Progress.unlocked({ parade_feather_wins: 1 }).includes('boss_parade_feather'));
  assert.ok(Progress.unlocked({ veil_boat_wins: 1 }).includes('boss_veil_boat'));
  assert.ok(Progress.unlocked({ tower_chime_wins: 1 }).includes('boss_tower_chime'));
  assert.ok(Progress.unlocked({ new_world_largo_wins: 1 }).includes('boss_new_world_largo'));
  assert.ok(Progress.unlocked({ camptown_races_wins: 1 }).includes('boss_camptown_races'));
  assert.ok(Progress.unlocked({ eine_kleine_wins: 1 }).includes('boss_eine_kleine'));
  assert.ok(Progress.unlocked({ perfect_fights: 1 }).includes('perfect_fight'));
  assert.equal(Progress.unlocked({ perfect_notes_total: 49 }).includes('perfect_notes_50'), false);
  assert.ok(Progress.unlocked({ perfect_notes_total: 50 }).includes('perfect_notes_50'));
  assert.equal(Progress.unlocked({ bosses_defeated: 5 }).includes('all_bosses'), false);
  assert.ok(Progress.unlocked({ bosses_defeated: 6 }).includes('all_bosses'));
  assert.equal(Progress.unlocked({ fights_played: 9 }).includes('fights_10'), false);
  assert.ok(Progress.unlocked({ fights_played: 10 }).includes('fights_10'));
});

test('un pmSave viejo rellena el registro una vez y no borra claves', () => {
  const legacy = {
    wins: 2,
    played: 3,
    lost: 1,
    perfectNotes: 12,
    perfectFights: 1,
    damage: 40,
    bossesDefeated: 1,
    bestAccuracy: 0.5,
    bosses: ['parade-feather', 'veil-boat', 'veil-boat', 'desconocido']
  };
  const storage = mem({
    pmSave: JSON.stringify(legacy),
    seenTutorial: '1',
    pmRival: 'tower-chime'
  });
  const rec = Progress.backfill('0.1.30', { storage, now: NOW });
  assert.strictEqual(rec.v, 1);
  assert.strictEqual(rec.slug, 'piano-magic');
  assert.strictEqual(rec.version, '0.1.30');
  assert.strictEqual(rec.updatedAt, NOW);
  assert.strictEqual(rec.stats.fights_played, 3);
  assert.strictEqual(rec.stats.fights_won, 2);
  assert.strictEqual(rec.stats.fights_lost, 1);
  assert.strictEqual(rec.stats.perfect_notes_total, 12);
  assert.strictEqual(rec.stats.perfect_fights, 1);
  assert.strictEqual(rec.stats.damage_total, 40);
  assert.strictEqual(rec.stats.bosses_defeated, 2);
  assert.strictEqual(rec.stats.best_accuracy_pct, 50);
  assert.strictEqual(rec.stats.parade_feather_wins, 1);
  assert.strictEqual(rec.stats.veil_boat_wins, 1);
  assert.strictEqual(rec.stats.tower_chime_wins, 0);
  assert.ok(rec.logros.includes('first_fight'));
  assert.ok(rec.logros.includes('first_win'));
  assert.ok(rec.logros.includes('boss_parade_feather'));
  assert.ok(rec.logros.includes('boss_veil_boat'));
  assert.ok(rec.logros.includes('perfect_fight'));
  assert.equal(rec.logros.includes('fights_10'), false);
  assert.strictEqual(rec.hitos.first_win, NOW);
  assert.deepStrictEqual(rec.logros, Object.keys(rec.hitos).sort());
  assert.strictEqual(storage.getItem('pmSave'), JSON.stringify(legacy));
  assert.strictEqual(storage.getItem('seenTutorial'), '1');
  assert.strictEqual(storage.getItem('pmRival'), 'tower-chime');

  storage.setItem('pmSave', JSON.stringify({ wins: 9 }));
  assert.strictEqual(Progress.backfill('0.1.30', { storage, now: '2026-10-24T00:00:00.000Z' }), null);
  assert.strictEqual(record(storage).stats.fights_won, 2);
  assert.strictEqual(record(storage).updatedAt, NOW);
});

test('el nombre canónico pisa el alias y la precisión se acota', () => {
  const storage = mem({
    pmSave: JSON.stringify({
      wins: 1,
      fights_won: 4,
      played: 1,
      bestAccuracy: 1,
      best_accuracy_pct: 15,
      parade_feather_wins: 3,
      bosses: ['parade-feather']
    })
  });
  const rec = Progress.backfill('0.1.30', { storage, now: NOW });
  assert.strictEqual(rec.stats.fights_won, 4);
  assert.strictEqual(rec.stats.fights_played, 4);
  assert.strictEqual(rec.stats.best_accuracy_pct, 15);
  assert.strictEqual(rec.stats.parade_feather_wins, 3);
  assert.strictEqual(rec.stats.bosses_defeated, 1);

  const fraction = mem({ pmSave: JSON.stringify({ bestAccuracy: 1, wins: 1, played: 0 }) });
  assert.strictEqual(Progress.backfill('0.1.30', { storage: fraction, now: NOW }).stats.best_accuracy_pct, 100);
  assert.strictEqual(Progress.backfill('0.1.30', {
    storage: mem({ pmSave: JSON.stringify({ bestAccuracy: 150 }) }),
    now: NOW
  }).stats.best_accuracy_pct, 100);
  assert.strictEqual(Progress.backfill('0.1.30', {
    storage: mem({ pmSave: JSON.stringify({ wins: -3, played: '2', perfectNotes: 4 }) }),
    now: NOW
  }).stats.fights_won, 0);
});

test('sin guardado escribe ceros y un registro válido no se pisa', () => {
  const empty = mem({ seenTutorial: '1' });
  const rec = Progress.backfill('0.1.30', { storage: empty, now: NOW });
  assert.strictEqual(rec.slug, 'piano-magic');
  assert.strictEqual(rec.v, 1);
  assert.deepStrictEqual(rec.logros, []);
  assert.deepStrictEqual(rec.hitos, {});
  assert.strictEqual(rec.stats.fights_played, 0);
  assert.strictEqual(rec.stats.fights_won, 0);
  assert.strictEqual(rec.stats.best_accuracy_pct, 0);
  assert.strictEqual(empty.getItem('seenTutorial'), '1');

  const kept = mem({
    [KEY]: JSON.stringify({
      v: 1,
      slug: 'piano-magic',
      version: '0.1.29',
      updatedAt: '2026-10-01T00:00:00.000Z',
      stats: { fights_won: 7, fights_played: 8 },
      logros: ['first_win'],
      hitos: { first_win: '2026-10-01T00:00:00.000Z' }
    }),
    pmSave: JSON.stringify({ wins: 1, played: 1 })
  });
  assert.strictEqual(Progress.backfill('0.1.30', { storage: kept, now: NOW }), null);
  assert.strictEqual(record(kept).stats.fights_won, 7);
  assert.strictEqual(record(kept).updatedAt, '2026-10-01T00:00:00.000Z');
  assert.strictEqual(kept.getItem('pmSave'), JSON.stringify({ wins: 1, played: 1 }));

  const badSave = mem({ pmSave: '{' });
  let threwSave = false;
  let zeros = null;
  try {
    zeros = Progress.backfill('0.1.31', { storage: badSave, now: NOW });
  } catch (e2) {
    threwSave = true;
  }
  assert.strictEqual(threwSave, false);
  assert.strictEqual(zeros.stats.fights_won, 0);
  assert.deepStrictEqual(zeros.logros, []);
  assert.strictEqual(badSave.getItem('pmSave'), '{');
  assert.deepStrictEqual(Object.keys(zeros.stats), Progress.STAT_KEYS);
});

test('una pelea suma stats y dos cierres seguidos se escriben una vez', async () => {
  const chart = tinyChart();
  const win = ended('win', [{ sync: 'perfect' }, { sync: 'perfect' }]);
  const summary = Progress.summarizeFight(chart, win);
  assert.strictEqual(summary.expected, 2);
  assert.strictEqual(summary.perfectFight, true);
  assert.strictEqual(summary.accuracy, 100);
  assert.strictEqual(Progress.summarizeFight(chart, ended('win', [{ sync: 'perfect' }, { sync: 'partial' }])).perfectFight, false);
  assert.strictEqual(Progress.summarizeFight(chart, ended('lose', [{ sync: 'perfect' }, { sync: 'perfect' }])).perfectFight, false);
  assert.strictEqual(Progress.summarizeFight(chart, ended('win', [{ sync: 'perfect' }, { sync: 'fail' }])).accuracy, 50);
  assert.strictEqual(Progress.summarizeFight(chart, { ended: true, free: true, outcome: 'win', barIndex: 3 }), null);
  assert.strictEqual(Progress.summarizeFight(Object.assign({}, chart, { id: 'libre' }), win), null);
  assert.strictEqual(Progress.summarizeFight(chart, { ended: false, outcome: 'win', barIndex: 3 }), null);

  let nowMs = 5_000;
  const storage = mem();
  const posts = [];
  const clock = {
    storage,
    now: NOW,
    nowMs: () => nowMs,
    window: { parent: { postMessage(data) { posts.push(data); } } },
    location: { origin: 'https://example.test' }
  };
  Progress.backfill('0.1.31', clock);
  assert.strictEqual(record(storage).stats.fights_played, 0);
  assert.strictEqual(posts.length, 1);
  const again = ended('win', [{ sync: 'perfect' }, { sync: 'fail' }], { damage: { total: 4 } });
  Progress.recordFight(chart, win, '0.1.31', clock);
  Progress.recordFight(chart, again, '0.1.31', clock);
  assert.strictEqual(record(storage).stats.fights_played, 0);
  nowMs = 5_400;
  const rec = Progress.flush(storage, clock);
  assert.strictEqual(rec.stats.fights_played, 2);
  assert.strictEqual(rec.stats.fights_won, 2);
  assert.strictEqual(rec.stats.fights_lost, 0);
  assert.strictEqual(rec.stats.perfect_notes_total, 3);
  assert.strictEqual(rec.stats.perfect_fights, 1);
  assert.strictEqual(rec.stats.damage_total, 16);
  assert.strictEqual(rec.stats.best_accuracy_pct, 100);
  assert.strictEqual(rec.stats.parade_feather_wins, 2);
  assert.strictEqual(rec.stats.bosses_defeated, 1);
  assert.ok(rec.logros.includes('first_win'));
  assert.ok(rec.logros.includes('boss_parade_feather'));
  assert.ok(rec.logros.includes('perfect_fight'));
  assert.strictEqual(posts.length, 2);
  assert.strictEqual(Progress.flush(storage, clock), null);
  assert.strictEqual(posts.length, 2);

  const veil = Chart.parse({
    id: 'veil-boat',
    title: 't',
    bpm: 60,
    timeSig: [4, 4],
    roomKey: 'C',
    setup: { bars: 1 },
    loop: [{ kind: 'hole', notes: [] }],
    hp: { player: 15, boss: 20 }
  });
  const loss = ended('lose', [], { barIndex: 1, damage: { total: 0 } });
  Progress.recordFight(veil, loss, '0.1.31', clock);
  nowMs = 5_500;
  assert.strictEqual(record(storage).stats.fights_lost, 0);
  const flushed = Progress.flush(storage, clock);
  assert.strictEqual(flushed.stats.fights_lost, 1);
  assert.strictEqual(flushed.stats.fights_played, 3);
  assert.strictEqual(flushed.stats.veil_boat_wins, 0);
  assert.strictEqual(flushed.stats.bosses_defeated, 1);
  assert.strictEqual(flushed.stats.best_accuracy_pct, 100);
  assert.strictEqual(posts.length, 3);
});

test('la primera victoria de cada jefe sube el contador una sola vez', () => {
  let stats = Progress.applyFight({}, {
    id: 'tower-chime', outcome: 'win', perfect: 2, perfectFight: false, accuracy: 40, damage: 5
  });
  stats = Progress.applyFight(stats, {
    id: 'tower-chime', outcome: 'win', perfect: 0, perfectFight: false, accuracy: 10, damage: 1
  });
  stats = Progress.applyFight(stats, {
    id: 'eine-kleine', outcome: 'win', perfect: 0, perfectFight: true, accuracy: 90, damage: 2
  });
  assert.strictEqual(stats.tower_chime_wins, 2);
  assert.strictEqual(stats.eine_kleine_wins, 1);
  assert.strictEqual(stats.bosses_defeated, 2);
  assert.strictEqual(stats.fights_won, 3);
  assert.strictEqual(stats.perfect_fights, 1);
  assert.strictEqual(stats.best_accuracy_pct, 90);
  assert.strictEqual(stats.damage_total, 8);
  const high = { bosses_defeated: 9, parade_feather_wins: 0 };
  const kept = Progress.applyFight(high, {
    id: 'parade-feather', outcome: 'lose', perfect: 0, perfectFight: false, accuracy: null, damage: 0
  });
  assert.strictEqual(kept.bosses_defeated, 9);
  assert.strictEqual(kept.fights_lost, 1);
});

test('la app rellena al cargar, anota el cierre y vuelca al salir', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(app, /Progress\.backfill\(VERSION\)/);
  assert.match(app, /Progress\.recordFight\(fightChart, state, VERSION\)/);
  assert.match(app, /Progress\.flush\(\)/);
  assert.match(app, /pagehide/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /visibilityState === 'hidden'/);
  assert.match(html, /js\/meta\.js\?v=0\.1\.40/);
  assert.match(html, /js\/progress\.js\?v=0\.1\.40/);
  const metaAt = html.indexOf('js/meta.js');
  const progressAt = html.indexOf('js/progress.js');
  const appAt = html.indexOf('js/app.js');
  assert.ok(metaAt > 0 && metaAt < progressAt && progressAt < appAt);
});

test('un registro roto se copia y el relleno lo rehace desde pmSave', () => {
  const pm = JSON.stringify({ wins: 2, played: 3, lost: 1 });
  const storage = mem({
    [KEY]: '{',
    pmSave: pm,
    seenTutorial: '1',
    pmRival: 'tower-chime',
    onscreenKeyboard: '0'
  });
  let threw = false;
  let rec = null;
  try {
    rec = Progress.backfill('0.1.31', { storage, now: NOW });
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, false);
  assert.strictEqual(storage.getItem(KEY + '.corrupt'), '{');
  assert.strictEqual(rec.stats.fights_won, 2);
  assert.strictEqual(rec.stats.fights_played, 3);
  assert.strictEqual(rec.stats.fights_lost, 1);
  assert.strictEqual(rec.hitos.first_win, NOW);
  assert.strictEqual(rec.version, '0.1.31');
  assert.strictEqual(storage.getItem('pmSave'), pm);
  assert.strictEqual(storage.getItem('seenTutorial'), '1');
  assert.strictEqual(storage.getItem('pmRival'), 'tower-chime');
  assert.strictEqual(storage.getItem('onscreenKeyboard'), '0');

  const mismatch = JSON.stringify({ v: 1, slug: 'otro', stats: { fights_won: 9 }, logros: ['first_win'] });
  const other = mem({ [KEY]: mismatch, pmSave: JSON.stringify({ wins: 1, played: 1 }) });
  const rec2 = Progress.backfill('0.1.31', { storage: other, now: NOW });
  assert.strictEqual(other.getItem(KEY + '.corrupt'), mismatch);
  assert.strictEqual(rec2.stats.fights_won, 1);
  assert.deepStrictEqual(rec2.logros.includes('first_win'), true);

  const oldV = JSON.stringify({ v: 0, slug: 'piano-magic', stats: { fights_won: 9 } });
  const legacy = mem({ [KEY]: oldV });
  const rec3 = Progress.backfill('0.1.31', { storage: legacy, now: NOW });
  assert.strictEqual(legacy.getItem(KEY + '.corrupt'), oldV);
  assert.strictEqual(rec3.stats.fights_won, 0);

  const blank = mem({ [KEY]: '' });
  const rec4 = Progress.backfill('0.1.31', { storage: blank, now: NOW });
  assert.strictEqual(blank.getItem(KEY + '.corrupt'), '');
  assert.strictEqual(rec4.stats.fights_played, 0);
});

test('demo y preview no escriben ni avisan', () => {
  const pm = JSON.stringify({ wins: 4, played: 4 });
  const posts = [];
  const storage = mem({ pmSave: pm, seenTutorial: '1' });
  const opts = {
    storage,
    now: NOW,
    demo: true,
    window: { parent: { postMessage(data) { posts.push(data); } } },
    location: { origin: 'https://example.test' }
  };
  assert.strictEqual(Progress.backfill('0.1.31', opts), null);
  assert.strictEqual(Progress.recordFight(tinyChart(), ended('win', [{ sync: 'perfect' }, { sync: 'perfect' }]), '0.1.31', opts), null);
  assert.strictEqual(Progress.flush(storage, opts), null);
  assert.strictEqual(storage.getItem(KEY), null);
  assert.strictEqual(posts.length, 0);
  assert.strictEqual(storage.getItem('pmSave'), pm);
  assert.strictEqual(storage.getItem('seenTutorial'), '1');

  const preview = mem({ pmSave: pm });
  assert.strictEqual(Progress.backfill('0.1.31', { storage: preview, search: '?demo=1', now: NOW }), null);
  assert.strictEqual(Progress.backfill('0.1.31', { storage: preview, search: '?x=1&preview=1', now: NOW }), null);
  assert.strictEqual(preview.getItem(KEY), null);
  assert.strictEqual(preview.getItem('pmSave'), pm);
});

test('las claves viejas quedan igual tras cargar y jugar', () => {
  const pm = JSON.stringify({ wins: 1, played: 2, bosses: ['parade-feather'], note: 'no tocar' });
  const storage = mem({
    pmSave: pm,
    seenTutorial: '1',
    pmRival: 'parade-feather',
    onscreenKeyboard: '1',
    'piano-transcribe.engine': 'keep'
  });
  let nowMs = 1000;
  const opts = { storage, now: NOW, nowMs: () => nowMs };
  const filled = Progress.backfill('0.1.31', opts);
  assert.strictEqual(filled.stats.fights_won, 1);
  Progress.recordFight(tinyChart(), ended('win', [{ sync: 'perfect' }, { sync: 'perfect' }]), '0.1.31', opts);
  nowMs = 2000;
  const played = Progress.flush(storage, opts);
  assert.strictEqual(played.stats.fights_won, 2);
  assert.strictEqual(played.stats.best_accuracy_pct, 100);
  Meta.metaUpdate(Progress.SLUG, 'v0.1.31', {
    stats: { fights_won: 0, best_accuracy_pct: 1, extra_blob: 5 }
  }, { storage, now: '2026-10-23T19:00:00.000Z', declare: Progress.STATS });
  assert.strictEqual(record(storage).stats.fights_won, 2);
  assert.strictEqual(record(storage).stats.best_accuracy_pct, 100);
  assert.strictEqual(record(storage).stats.extra_blob, undefined);
  assert.strictEqual(record(storage).version, '0.1.31');
  assert.strictEqual(storage.getItem('pmSave'), pm);
  assert.strictEqual(storage.getItem('seenTutorial'), '1');
  assert.strictEqual(storage.getItem('pmRival'), 'parade-feather');
  assert.strictEqual(storage.getItem('onscreenKeyboard'), '1');
  assert.strictEqual(storage.getItem('piano-transcribe.engine'), 'keep');
  assert.equal(storage.getItem(KEY).includes('no tocar'), false);
  assert.equal(storage.getItem(KEY).includes('base64'), false);
});

test('ocultar la página vuelca un cambio pendiente antes de un segundo y no escribe si no hay', () => {
  let nowMs = 10_000;
  const posts = [];
  const storage = mem();
  const clock = {
    storage,
    now: NOW,
    nowMs: () => nowMs,
    window: { parent: { postMessage(data) { posts.push(data); } } },
    location: { origin: 'https://example.test' }
  };
  Progress.backfill('0.1.39', clock);
  assert.strictEqual(posts.length, 1);
  Progress.recordFight(tinyChart(), ended('win', [{ sync: 'perfect' }, { sync: 'perfect' }]), '0.1.39', clock);
  nowMs = 10_200;
  assert.strictEqual(record(storage).stats.fights_played, 0);
  assert.strictEqual(Progress.flush(storage, Object.assign({}, clock, { demo: true })), null);
  assert.strictEqual(record(storage).stats.fights_played, 0);
  assert.strictEqual(posts.length, 1);
  const hidden = Progress.flush(storage, clock);
  assert.strictEqual(hidden.stats.fights_played, 1);
  assert.strictEqual(hidden.stats.fights_won, 1);
  assert.strictEqual(posts.length, 2);
  assert.strictEqual(posts[1].type, 'meta');
  assert.strictEqual(Progress.flush(storage, clock), null);
  assert.strictEqual(posts.length, 2);
  assert.strictEqual(record(storage).stats.fights_played, 1);
});

test('el temporizador real no escribe más de una vez por segundo', async () => {
  const writes = [];
  const data = {};
  const storage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { writes.push(k); data[k] = String(v); }
  };
  Progress.backfill('0.1.31', { storage, now: NOW });
  assert.deepStrictEqual(writes, [KEY]);
  Progress.recordFight(tinyChart(), ended('win', [{ sync: 'perfect' }, { sync: 'perfect' }]), '0.1.31', { storage, now: NOW });
  Progress.recordFight(tinyChart(), ended('lose', [{ sync: 'fail' }]), '0.1.31', { storage, now: NOW });
  assert.deepStrictEqual(writes, [KEY]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepStrictEqual(writes, [KEY, KEY]);
  assert.strictEqual(JSON.parse(data[KEY]).stats.fights_played, 2);
  assert.strictEqual(JSON.parse(data[KEY]).stats.fights_won, 1);
  assert.strictEqual(JSON.parse(data[KEY]).stats.fights_lost, 1);
  assert.strictEqual(Progress.flush(storage), null);
  assert.strictEqual(writes.length, 2);
});
