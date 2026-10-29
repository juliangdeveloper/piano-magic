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
    if (n.dynamic === 'f' || n.dynamic === 'p' || n.dynamic === 'mf' || n.dynamic === 'mp' || n.dynamic === 'ff') {
      note.dynamic = n.dynamic;
    }
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
    parse: parse,
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
