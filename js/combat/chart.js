'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Chart = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KINDS = { defend: true, hole: true, setup: true };

  function fail(msg) {
    var err = new Error(msg);
    err.name = 'ChartError';
    throw err;
  }

  function isPitch(p) {
    return typeof p === 'string' && /^[A-Ga-g][#b♭♯]?-?\d+$/.test(p.trim());
  }

  var DURATION_BEATS = {
    sixteenth: 0.25,
    eighth: 0.5,
    'dotted eighth': 0.75,
    quarter: 1,
    'dotted quarter': 1.5,
    half: 2,
    'dotted half': 3,
    whole: 4
  };

  function beatsForDuration(value) {
    if (typeof value === 'number' && isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(DURATION_BEATS, value)) {
      return DURATION_BEATS[value];
    }
    return null;
  }

  var DYNAMIC_ORDER = ['p', 'mp', 'mf', 'f', 'ff'];
  var DYNAMIC_LEVEL = { p: 0.5, mp: 0.64, mf: 0.8, f: 1, ff: 1 };
  var DEFAULT_LEVEL = 1;
  var HAIRPIN_CRESC = 'cresc';
  var HAIRPIN_DIM = 'dim';
  var SUS_INTERVALS = [0, 5, 7];
  var PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function normalizeNote(n, i) {
    if (!n || !isPitch(n.pitch)) fail('nota[' + i + '] pitch inválido');
    if (typeof n.beat !== 'number' || !isFinite(n.beat) || n.beat < 0) {
      fail('nota[' + i + '] beat inválido');
    }
    var rawDur = n.dur != null ? n.dur : n.duration;
    var dur = 1;
    if (typeof rawDur === 'string' || (rawDur != null && typeof rawDur !== 'number')) {
      dur = beatsForDuration(rawDur);
      if (dur == null) fail('nota[' + i + '] duración inválida');
    } else if (typeof rawDur === 'number') {
      dur = (isFinite(rawDur) && rawDur > 0) ? rawDur : 1;
    }
    if (n.hand !== 'L' && n.hand !== 'l' && n.hand !== 'R' && n.hand !== 'r') {
      fail('nota[' + i + '] sin mano (hand debe ser L o R)');
    }
    var hand = (n.hand === 'L' || n.hand === 'l') ? 'L' : 'R';
    var note = { pitch: n.pitch, beat: n.beat, dur: dur, hand: hand };
    if (n.finger != null) {
      if (typeof n.finger !== 'number' || !isFinite(n.finger) || n.finger !== Math.round(n.finger) || n.finger < 1 || n.finger > 5) {
        fail('nota[' + i + '] dedo inválido');
      }
      note.finger = n.finger;
    }
    if (n.accent === true) note.accent = true;
    if (n.staccato === true) note.staccato = true;
    if (n.tie === true) note.tie = true;
    if (Object.prototype.hasOwnProperty.call(DYNAMIC_LEVEL, n.dynamic)) note.dynamic = n.dynamic;
    if (n.hairpin === HAIRPIN_CRESC || n.hairpin === HAIRPIN_DIM) note.hairpin = n.hairpin;
    return note;
  }

  function normalizeBar(bar, idx) {
    if (!bar || typeof bar !== 'object') fail('loop[' + idx + '] inválido');
    var kind = bar.kind;
    if (!KINDS[kind]) fail('loop[' + idx + '] kind inválido: ' + kind);
    var notes = Array.isArray(bar.notes) ? bar.notes.map(normalizeNote) : [];
    if (kind === 'hole' && notes.length) {
    }
    return {
      i: (typeof bar.i === 'number') ? bar.i : idx,
      kind: kind,
      notes: notes
    };
  }

  var PLAYER_HP = 1000;
  var TIE_EPS = 1e-6;

  function tieSource(loop, b, note, bpb) {
    var cands = [];
    var j;
    var notes = loop[b].notes;
    for (j = 0; j < notes.length; j++) {
      if (notes[j] !== note) cands.push({ n: notes[j], back: note.beat - notes[j].beat });
    }
    if (b > 0 && note.beat < TIE_EPS && loop[b - 1].kind === loop[b].kind) {
      notes = loop[b - 1].notes;
      for (j = 0; j < notes.length; j++) cands.push({ n: notes[j], back: bpb - notes[j].beat });
    }
    for (j = 0; j < cands.length; j++) {
      var c = cands[j];
      if (c.n.pitch !== note.pitch || c.n.hand !== note.hand) continue;
      if (Math.abs(c.back - c.n.dur) < TIE_EPS) return c;
    }
    return null;
  }

  function linkTies(loop, bpb) {
    var tied = [];
    var heads = [];
    function headOf(n) {
      var k = tied.indexOf(n);
      return k < 0 ? n : heads[k];
    }
    for (var b = 0; b < loop.length; b++) {
      var notes = loop[b].notes;
      for (var j = 0; j < notes.length; j++) {
        var note = notes[j];
        if (!note.tie) continue;
        var src = tieSource(loop, b, note, bpb);
        if (!src) {
          delete note.tie;
          continue;
        }
        note.tieBack = src.back;
        var head = headOf(src.n);
        tied.push(note);
        heads.push(head);
        head.hold = (head.hold || head.dur) + note.dur;
      }
    }
  }

  function midiOf(pitch) {
    var m = /^([A-Ga-g])([#b♭♯]?)(-?\d+)$/.exec(String(pitch).trim());
    if (!m) return null;
    var acc = m[2] === '#' || m[2] === '♯' ? 1 : (m[2] === 'b' || m[2] === '♭' ? -1 : 0);
    return (parseInt(m[3], 10) + 1) * 12 + PITCH_CLASS[m[1].toUpperCase()] + acc;
  }

  function timeline(loop, bpb) {
    var list = [];
    for (var b = 0; b < loop.length; b++) {
      for (var j = 0; j < loop[b].notes.length; j++) {
        list.push({ n: loop[b].notes[j], t: b * bpb + loop[b].notes[j].beat });
      }
    }
    list.sort(function (a, z) { return a.t - z.t; });
    return list;
  }

  function stepFrom(dynamic, dir) {
    var k = DYNAMIC_ORDER.indexOf(dynamic);
    if (k < 0) k = DYNAMIC_ORDER.length - 2;
    k = Math.max(0, Math.min(DYNAMIC_ORDER.length - 1, k + dir));
    return DYNAMIC_ORDER[k];
  }

  function hairpinRuns(list) {
    var runs = [];
    var run = null;
    for (var i = 0; i < list.length; i++) {
      var kind = list[i].n.hairpin;
      if (!kind) continue;
      if (run && run.kind === kind && list[i].t <= run.end + TIE_EPS) {
        run.items.push(list[i]);
        run.end = Math.max(run.end, list[i].t + list[i].n.dur);
        continue;
      }
      run = { kind: kind, start: list[i].t, end: list[i].t + list[i].n.dur, items: [list[i]] };
      runs.push(run);
    }
    return runs;
  }

  function shapeDynamics(loop, bpb) {
    var list = timeline(loop, bpb);
    var marked = list.some(function (e) { return e.n.dynamic || e.n.hairpin; });
    if (!marked) return;
    var runs = hairpinRuns(list);
    var cur = null;
    var r = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      while (r < runs.length && runs[r].end <= e.t + TIE_EPS && runs[r].done) r += 1;
      if (e.n.dynamic) cur = e.n.dynamic;
      var level = cur ? DYNAMIC_LEVEL[cur] : DEFAULT_LEVEL;
      var run = runs[r];
      if (run && e.t >= run.start - TIE_EPS && e.t < run.end - TIE_EPS) {
        if (run.from == null) {
          run.from = cur || DYNAMIC_ORDER[DYNAMIC_ORDER.length - 2];
          run.to = stepFrom(run.from, run.kind === HAIRPIN_CRESC ? 1 : -1);
        }
        var span = run.end - run.start;
        var frac = span > 0 ? (e.t - run.start) / span : 0;
        level = DYNAMIC_LEVEL[run.from] + (DYNAMIC_LEVEL[run.to] - DYNAMIC_LEVEL[run.from]) * frac;
        if (e.n.hairpin === run.kind) {
          e.n.wedge = {
            kind: run.kind,
            from: span > 0 ? (e.t - run.start) / span : 0,
            to: span > 0 ? Math.min(1, (e.t + e.n.dur - run.start) / span) : 1
          };
        }
      } else if (run && run.from != null && e.t >= run.end - TIE_EPS) {
        cur = run.to;
        run.done = true;
        r += 1;
        level = DYNAMIC_LEVEL[e.n.dynamic || cur];
        if (e.n.dynamic) cur = e.n.dynamic;
      }
      e.n.level = Math.round(level * 1000) / 1000;
    }
  }

  function chordGroups(notes, hand) {
    var by = {};
    var keys = [];
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.hand !== hand || n.tie) continue;
      var k = String(n.beat);
      if (!by[k]) { by[k] = []; keys.push(k); }
      by[k].push(n);
    }
    keys.sort(function (a, z) { return parseFloat(a) - parseFloat(z); });
    return keys.map(function (k) { return by[k]; }).filter(function (g) { return g.length >= 3; });
  }

  function isSus(group) {
    var ms = group.map(function (n) { return midiOf(n.pitch); });
    var low = Math.min.apply(null, ms);
    var pcs = {};
    ms.forEach(function (m) { pcs[(m - low) % 12] = true; });
    var keys = Object.keys(pcs).map(Number).sort(function (a, z) { return a - z; });
    return keys.length === SUS_INTERVALS.length && keys.every(function (v, i) { return v === SUS_INTERVALS[i]; });
  }

  function markSuspensions(loop) {
    var hanging = false;
    for (var b = 0; b < loop.length; b++) {
      var groups = chordGroups(loop[b].notes, 'L');
      for (var g = 0; g < groups.length; g++) {
        var sus = isSus(groups[g]);
        for (var k = 0; k < groups[g].length; k++) {
          if (sus) groups[g][k].sus = true;
          else if (hanging) groups[g][k].resolves = true;
        }
        hanging = sus;
      }
    }
  }

  function attacks(notes) {
    var out = [];
    for (var i = 0; i < (notes || []).length; i++) {
      if (notes[i] && !notes[i].tie) out.push(notes[i]);
    }
    return out;
  }

  function parse(raw) {
    if (!raw || typeof raw !== 'object') fail('chart vacío');
    if (!raw.id) fail('falta id');
    if (!raw.title) fail('falta title');
    var bpm = raw.bpm;
    if (typeof bpm !== 'number' || !(bpm > 0)) fail('bpm inválido');
    var ts = raw.timeSig;
    if (!Array.isArray(ts) || ts.length < 2) fail('timeSig inválido');
    var timeSig = [ts[0] | 0, ts[1] | 0];
    if (timeSig[0] < 1 || timeSig[1] < 1) fail('timeSig inválido');
    if (!raw.roomKey) fail('falta roomKey');
    var setup = raw.setup || { listenOnly: true, bars: 1 };
    var setupBars = (typeof setup.bars === 'number' && setup.bars >= 0) ? setup.bars : 1;
    if (!Array.isArray(raw.loop) || raw.loop.length < 1) fail('loop vacío');
    var loop = raw.loop.map(normalizeBar);
    var hp = raw.hp || {};
    var player = hp.player;
    var boss = hp.boss;
    if (typeof player !== 'number' || player < 1) fail('hp.player inválido');
    if (typeof boss !== 'number' || boss < 1) fail('hp.boss inválido');
    if (typeof PLAYER_HP === 'number' && PLAYER_HP >= 1) player = PLAYER_HP;
    linkTies(loop, timeSig[0] * (4 / timeSig[1]));
    shapeDynamics(loop, timeSig[0] * (4 / timeSig[1]));
    markSuspensions(loop);

    return {
      id: String(raw.id),
      title: String(raw.title),
      bpm: bpm,
      timeSig: timeSig,
      roomKey: String(raw.roomKey),
      roomScale: Array.isArray(raw.roomScale) && raw.roomScale.length ? raw.roomScale.map(String) : null,
      setup: { listenOnly: setup.listenOnly !== false, bars: setupBars },
      loop: loop,
      hp: { player: player, boss: boss }
    };
  }

  function beatsPerBar(chart) {
    var ts = chart.timeSig;
    return ts[0] * (4 / ts[1]);
  }

  function setupBars(chart) {
    return chart.setup.bars;
  }

  function loopLength(chart) {
    return chart.loop.length;
  }

  function barAt(chart, globalBar) {
    var g = globalBar | 0;
    if (g < 0) g = 0;
    var setup = setupBars(chart);
    var bpb = beatsPerBar(chart);
    if (g < setup) {
      return {
        globalBar: g,
        kind: 'setup',
        listenOnly: true,
        i: g,
        notes: [],
        startBeat: g * bpb,
        loopIndex: -1,
        cycle: -1
      };
    }
    var idx = (g - setup) % loopLength(chart);
    var cycle = Math.floor((g - setup) / loopLength(chart));
    var bar = chart.loop[idx];
    return {
      globalBar: g,
      kind: bar.kind,
      listenOnly: false,
      i: bar.i,
      notes: bar.notes,
      startBeat: g * bpb,
      loopIndex: idx,
      cycle: cycle
    };
  }

  function activePitches(bars, beat) {
    var seen = {};
    var out = [];
    if (!bars || typeof beat !== 'number' || !isFinite(beat)) return out;
    var i;
    var j;
    var bar;
    var notes;
    var note;
    var start;
    var dur;
    for (i = 0; i < bars.length; i++) {
      bar = bars[i];
      if (!bar) continue;
      notes = bar.notes || [];
      for (j = 0; j < notes.length; j++) {
        note = notes[j];
        if (!note || !note.pitch) continue;
        start = hitOnset((bar.startBeat || 0) + (note.beat || 0));
        dur = (typeof note.dur === 'number' && note.dur > 0) ? note.dur : 0;
        if (dur <= 0) continue;
        if (beat + 1e-6 < start || beat >= start + dur - 1e-9) continue;
        if (seen[note.pitch]) continue;
        seen[note.pitch] = true;
        out.push(note.pitch);
      }
    }
    return out;
  }

  function upcoming(chart, fromBar, count) {
    count = count || 4;
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(barAt(chart, fromBar + i));
    }
    return out;
  }

  var BEAT_CENTER = 0.5;

  function hitOnset(beat) {
    var b = (typeof beat === 'number' && isFinite(beat)) ? beat : 0;
    return b + BEAT_CENTER;
  }

  function centerReached(beat) {
    if (typeof beat !== 'number' || !isFinite(beat)) return -1;
    return Math.floor(beat - BEAT_CENTER + 1e-6);
  }

  return {
    PLAYER_HP: PLAYER_HP,
    DYNAMIC_LEVEL: DYNAMIC_LEVEL,
    DEFAULT_LEVEL: DEFAULT_LEVEL,
    parse: parse,
    attacks: attacks,
    activePitches: activePitches,
    beatsForDuration: beatsForDuration,
    DURATION_BEATS: DURATION_BEATS,
    barAt: barAt,
    upcoming: upcoming,
    beatsPerBar: beatsPerBar,
    setupBars: setupBars,
    loopLength: loopLength,
    BEAT_CENTER: BEAT_CENTER,
    hitOnset: hitOnset,
    centerReached: centerReached
  };
});
