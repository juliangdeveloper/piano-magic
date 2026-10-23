// js/progress.js — estadísticas y logros de piano-magic.
// UMD: module.exports + window.Progress.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./meta.js'), require('./combat/chart.js'));
  } else {
    root.Progress = factory(root.Meta, root.Chart);
  }
})(typeof self !== 'undefined' ? self : this, function (Meta, Chart) {
  'use strict';

  var SLUG = 'piano-magic';
  var SAVE_KEY = 'pmSave';
  var DEBOUNCE_MS = 1000;

  // Claves declaradas, en este orden, como máximo 20.
  // monotonic: totales, conteos y mejores no bajan.
  var STATS = [
    { key: 'fights_played', monotonic: true },
    { key: 'fights_won', monotonic: true },
    { key: 'fights_lost', monotonic: true },
    { key: 'perfect_notes_total', monotonic: true },
    { key: 'bosses_defeated', monotonic: true },
    { key: 'best_accuracy_pct', monotonic: true },
    { key: 'perfect_fights', monotonic: true },
    { key: 'damage_total', monotonic: true },
    { key: 'parade_feather_wins', monotonic: true },
    { key: 'veil_boat_wins', monotonic: true },
    { key: 'tower_chime_wins', monotonic: true },
    { key: 'new_world_largo_wins', monotonic: true },
    { key: 'camptown_races_wins', monotonic: true },
    { key: 'eine_kleine_wins', monotonic: true }
  ];
  var STAT_KEYS = STATS.map(function (item) { return item.key; });

  var BOSSES = [
    'parade-feather',
    'veil-boat',
    'tower-chime',
    'new-world-largo',
    'camptown-races',
    'eine-kleine'
  ];

  // Ids estables, de la primera pelea al dominio. No se renombran.
  var ACHIEVEMENTS = [
    // Primera pelea terminada, ganada o perdida.
    { id: 'first_fight', test: function (s) { return (s.fights_played || 0) >= 1; } },
    // Primera victoria.
    { id: 'first_win', test: function (s) { return (s.fights_won || 0) >= 1; } },
    // Parade Feather derrotado al menos una vez.
    { id: 'boss_parade_feather', test: function (s) { return (s.parade_feather_wins || 0) >= 1; } },
    // Veil Boat derrotado al menos una vez.
    { id: 'boss_veil_boat', test: function (s) { return (s.veil_boat_wins || 0) >= 1; } },
    // Tower Chime derrotado al menos una vez.
    { id: 'boss_tower_chime', test: function (s) { return (s.tower_chime_wins || 0) >= 1; } },
    // New World Largo derrotado al menos una vez.
    { id: 'boss_new_world_largo', test: function (s) { return (s.new_world_largo_wins || 0) >= 1; } },
    // Camptown Races derrotado al menos una vez.
    { id: 'boss_camptown_races', test: function (s) { return (s.camptown_races_wins || 0) >= 1; } },
    // Eine Kleine derrotado al menos una vez.
    { id: 'boss_eine_kleine', test: function (s) { return (s.eine_kleine_wins || 0) >= 1; } },
    // Victoria con cada nota de defensa perfecta, sin parciales ni fallos.
    { id: 'perfect_fight', test: function (s) { return (s.perfect_fights || 0) >= 1; } },
    // Cincuenta notas de defensa perfectas.
    { id: 'perfect_notes_50', test: function (s) { return (s.perfect_notes_total || 0) >= 50; } },
    // Los seis jefes derrotados.
    { id: 'all_bosses', test: function (s) { return (s.bosses_defeated || 0) >= 6; } },
    // Diez peleas terminadas.
    { id: 'fights_10', test: function (s) { return (s.fights_played || 0) >= 10; } }
  ];

  var ALIASES = {
    played: 'fights_played',
    wins: 'fights_won',
    lost: 'fights_lost',
    perfectNotes: 'perfect_notes_total',
    perfectFights: 'perfect_fights',
    damage: 'damage_total',
    bossesDefeated: 'bosses_defeated'
  };

  var sessions = typeof WeakMap === 'function' ? new WeakMap() : null;

  function sessionFor(storage) {
    if (!sessions) return { lastWrite: 0, timer: null, pending: null };
    var s = sessions.get(storage);
    if (!s) {
      s = { lastWrite: 0, timer: null, pending: null };
      sessions.set(storage, s);
    }
    return s;
  }

  function winKey(bossId) {
    return String(bossId).replace(/-/g, '_') + '_wins';
  }

  function knownBoss(id) {
    for (var i = 0; i < BOSSES.length; i++) if (BOSSES[i] === id) return true;
    return false;
  }

  function zeroStats() {
    var s = {};
    for (var i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] = 0;
    return s;
  }

  function num(v) {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return null;
    return v;
  }

  function unlocked(stats) {
    var ids = [];
    var src = stats || {};
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      try {
        if (ACHIEVEMENTS[i].test(src)) ids.push(ACHIEVEMENTS[i].id);
      } catch (e) {}
    }
    return ids;
  }

  function storageOf(opts) {
    if (opts && opts.storage) return opts.storage;
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (e) {}
    return null;
  }

  function demoOn(opts) {
    if (opts && opts.demo === true) return true;
    var search = '';
    if (opts && typeof opts.search === 'string') search = opts.search;
    else {
      try {
        if (typeof location !== 'undefined' && location && typeof location.search === 'string') search = location.search;
      } catch (e) {}
    }
    return /(^|[?&])(demo|preview)=1(&|$)/.test(search);
  }

  function clockMs(opts) {
    if (opts && typeof opts.nowMs === 'function') return opts.nowMs();
    if (opts && typeof opts.nowMs === 'number') return opts.nowMs;
    return Date.now();
  }

  function hasFakeClock(opts) {
    return !!(opts && (typeof opts.nowMs === 'function' || typeof opts.nowMs === 'number'));
  }

  function callOpts(opts) {
    var o = { declare: STATS };
    if (!opts) return o;
    if (opts.storage) o.storage = opts.storage;
    if (opts.now != null) o.now = opts.now;
    if (opts.nowMs != null) o.nowMs = opts.nowMs;
    if (opts.demo != null) o.demo = opts.demo;
    if (opts.search != null) o.search = opts.search;
    if (Object.prototype.hasOwnProperty.call(opts, 'window')) o.window = opts.window;
    if (opts.location) o.location = opts.location;
    return o;
  }

  function copyStats(stats) {
    var next = zeroStats();
    if (!stats) return next;
    var k;
    for (k in stats) {
      if (!Object.prototype.hasOwnProperty.call(stats, k)) continue;
      if (typeof stats[k] === 'number' && isFinite(stats[k])) next[k] = stats[k];
    }
    for (var i = 0; i < STAT_KEYS.length; i++) {
      if (typeof next[STAT_KEYS[i]] !== 'number' || !isFinite(next[STAT_KEYS[i]])) next[STAT_KEYS[i]] = 0;
    }
    return next;
  }

  function applyLegacy(stats, save) {
    if (!save || typeof save !== 'object') return stats;
    var k;
    var n;
    for (k in ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(ALIASES, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(save, k)) continue;
      n = num(save[k]);
      if (n != null) stats[ALIASES[k]] = n;
    }
    for (var i = 0; i < STAT_KEYS.length; i++) {
      k = STAT_KEYS[i];
      if (k === 'best_accuracy_pct') continue;
      if (!Object.prototype.hasOwnProperty.call(save, k)) continue;
      n = num(save[k]);
      if (n != null) stats[k] = n;
    }

    var acc = null;
    var accIsAlias = false;
    if (Object.prototype.hasOwnProperty.call(save, 'bestAccuracy')) {
      n = num(save.bestAccuracy);
      if (n != null) {
        acc = n;
        accIsAlias = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(save, 'best_accuracy_pct')) {
      n = num(save.best_accuracy_pct);
      if (n != null) {
        acc = n;
        accIsAlias = false;
      }
    }
    if (acc != null) {
      if (accIsAlias && acc <= 1) acc = acc * 100;
      if (acc > 100) acc = 100;
      stats.best_accuracy_pct = Math.round(acc);
    }

    var known = {};
    for (i = 0; i < BOSSES.length; i++) known[BOSSES[i]] = true;
    var bosses = Array.isArray(save.bosses) ? save.bosses : [];
    var seen = {};
    for (i = 0; i < bosses.length; i++) {
      var id = bosses[i];
      if (!known[id] || seen[id]) continue;
      seen[id] = true;
      k = winKey(id);
      if ((stats[k] || 0) < 1) stats[k] = 1;
    }
    var unique = 0;
    for (i = 0; i < BOSSES.length; i++) {
      if ((stats[winKey(BOSSES[i])] || 0) >= 1) unique += 1;
    }
    if (unique > (stats.bosses_defeated || 0)) stats.bosses_defeated = unique;
    if ((stats.fights_won || 0) > (stats.fights_played || 0)) stats.fights_played = stats.fights_won;
    var both = (stats.fights_won || 0) + (stats.fights_lost || 0);
    if (both > (stats.fights_played || 0)) stats.fights_played = both;
    return stats;
  }

  function readStats(storage) {
    var base = zeroStats();
    try {
      var raw = storage.getItem(Meta.metaKey(SLUG));
      if (typeof raw !== 'string' || !raw) return base;
      var rec = JSON.parse(raw);
      if (!rec || !rec.stats || typeof rec.stats !== 'object') return base;
      return copyStats(rec.stats);
    } catch (e) {
      return base;
    }
  }

  function legacyStats(storage) {
    var stats = zeroStats();
    var saveRaw = null;
    try { saveRaw = storage.getItem(SAVE_KEY); } catch (e1) { saveRaw = null; }
    if (typeof saveRaw === 'string' && saveRaw) {
      try {
        var save = JSON.parse(saveRaw);
        if (save && typeof save === 'object') applyLegacy(stats, save);
      } catch (eSave) {}
    }
    return stats;
  }

  function recordValid(raw) {
    if (typeof raw !== 'string' || !raw) return false;
    try {
      var parsed = JSON.parse(raw);
      return !!(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === 1 && parsed.slug === SLUG);
    } catch (e) {
      return false;
    }
  }

  function backfill(version, opts) {
    try {
      if (demoOn(opts)) return null;
      var storage = storageOf(opts);
      if (!storage || !Meta) return null;
      var raw;
      try { raw = storage.getItem(Meta.metaKey(SLUG)); } catch (e0) { return null; }
      if (recordValid(raw)) return null;
      return enqueue(version, legacyStats(storage), opts);
    } catch (e) {
      return null;
    }
  }

  function summarizeFight(chart, state) {
    try {
      if (!state || state.free || !state.ended || !chart) return null;
      var id = chart.id || state.chartId || '';
      if (id === 'libre') return null;
      var barIndex = state.barIndex | 0;
      if (barIndex < 0) barIndex = 0;
      var expected = 0;
      if (Chart && typeof Chart.barAt === 'function') {
        for (var b = 0; b < barIndex; b++) {
          var bar = Chart.barAt(chart, b);
          if (bar && bar.kind === 'defend' && bar.notes) expected += bar.notes.length;
        }
      }
      var notes = Array.isArray(state.defendNotes) ? state.defendNotes : [];
      var perfect = 0;
      var partial = 0;
      var fail = 0;
      for (var i = 0; i < notes.length; i++) {
        var sync = notes[i] && notes[i].sync;
        if (sync === 'perfect') perfect += 1;
        else if (sync === 'partial') partial += 1;
        else fail += 1;
      }
      var hit = perfect + partial;
      if (hit > expected) hit = expected;
      var outcome = state.outcome === 'win' ? 'win' : 'lose';
      var perfectFight = outcome === 'win' && expected > 0 && perfect >= expected && partial === 0 && fail === 0;
      var accuracy = expected > 0 ? Math.round(100 * hit / expected) : null;
      var damage = 0;
      if (state.damage && typeof state.damage.total === 'number' && isFinite(state.damage.total) && state.damage.total > 0) {
        damage = state.damage.total;
      }
      return {
        id: id,
        outcome: outcome,
        expected: expected,
        perfect: perfect,
        partial: partial,
        fail: fail,
        hit: hit,
        perfectFight: perfectFight,
        accuracy: accuracy,
        damage: damage
      };
    } catch (e) {
      return null;
    }
  }

  function applyFight(stats, summary) {
    var next = copyStats(stats);
    if (!summary) return next;
    next.fights_played = (next.fights_played || 0) + 1;
    if (summary.outcome === 'win') {
      next.fights_won = (next.fights_won || 0) + 1;
      if (knownBoss(summary.id)) {
        var wk = winKey(summary.id);
        var prev = next[wk] || 0;
        if (prev < 1) next.bosses_defeated = (next.bosses_defeated || 0) + 1;
        next[wk] = prev + 1;
      }
    } else {
      next.fights_lost = (next.fights_lost || 0) + 1;
    }
    next.perfect_notes_total = (next.perfect_notes_total || 0) + (summary.perfect || 0);
    if (summary.perfectFight) next.perfect_fights = (next.perfect_fights || 0) + 1;
    next.damage_total = (next.damage_total || 0) + (summary.damage || 0);
    if (typeof summary.accuracy === 'number' && summary.accuracy > (next.best_accuracy_pct || 0)) {
      next.best_accuracy_pct = summary.accuracy;
    }
    return next;
  }

  function commit(version, stats, opts) {
    if (!Meta) return null;
    if (demoOn(opts)) return null;
    return Meta.metaUpdate(SLUG, version, { stats: stats, logros: unlocked(stats) }, opts);
  }

  function due(sess) {
    if (!sess.lastWrite) return true;
    return clockMs(sess.opts) - sess.lastWrite >= DEBOUNCE_MS;
  }

  function commitPending(sess) {
    if (!sess.pending || !due(sess)) return null;
    var job = sess.pending;
    sess.pending = null;
    if (sess.timer) {
      clearTimeout(sess.timer);
      sess.timer = null;
    }
    var rec = null;
    try { rec = commit(job.version, job.stats, job.opts); } catch (e) { rec = null; }
    if (rec) sess.lastWrite = clockMs(job.opts);
    else sess.pending = job;
    return rec;
  }

  function arm(sess) {
    if (!sess.pending || sess.timer) return;
    if (!due(sess)) {
      if (hasFakeClock(sess.opts)) return;
      var wait = Math.max(0, DEBOUNCE_MS - (clockMs(sess.opts) - sess.lastWrite));
      sess.timer = setTimeout(function () {
        sess.timer = null;
        try {
          if (!commitPending(sess) && sess.pending) arm(sess);
        } catch (e) {}
      }, wait);
      return;
    }
    commitPending(sess);
  }

  function enqueue(version, stats, opts) {
    if (demoOn(opts)) return null;
    var storage = storageOf(opts);
    if (!storage) return null;
    var use = callOpts(opts);
    if (!use.storage) use.storage = storage;
    var sess = sessionFor(storage);
    sess.opts = use;
    sess.pending = { version: version, stats: stats, opts: use };
    if (due(sess)) return commitPending(sess);
    arm(sess);
    return null;
  }

  function flush(storage, opts) {
    try {
      if (demoOn(opts)) return null;
      var st = storage || storageOf(opts);
      if (!st) return null;
      var sess = sessionFor(st);
      if (!sess.pending) return null;
      if (opts) {
        var merged = callOpts(opts);
        if (!merged.storage) merged.storage = st;
        if (sess.opts && sess.opts.now != null && merged.now == null) merged.now = sess.opts.now;
        if (sess.opts && sess.opts.nowMs != null && merged.nowMs == null) merged.nowMs = sess.opts.nowMs;
        sess.opts = merged;
        if (sess.pending) sess.pending.opts = merged;
      }
      if (!due(sess)) return null;
      return commitPending(sess);
    } catch (e) {
      return null;
    }
  }

  function recordFight(chart, state, version, opts) {
    try {
      if (demoOn(opts)) return null;
      var summary = summarizeFight(chart, state);
      if (!summary) return null;
      var storage = storageOf(opts);
      if (!storage || !Meta) return null;
      var sess = sessionFor(storage);
      var base = sess.pending ? sess.pending.stats : readStats(storage);
      enqueue(version, applyFight(base, summary), opts);
      return summary;
    } catch (e) {
      return null;
    }
  }

  return {
    SLUG: SLUG,
    STATS: STATS,
    STAT_KEYS: STAT_KEYS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    BOSSES: BOSSES,
    unlocked: unlocked,
    applyFight: applyFight,
    summarizeFight: summarizeFight,
    backfill: backfill,
    recordFight: recordFight,
    flush: flush
  };
});
