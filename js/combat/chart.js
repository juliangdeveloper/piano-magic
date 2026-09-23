// js/combat/chart.js — carga y consulta de charts de combate.
// Pura, sin DOM. UMD: module.exports + window.Chart.
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

  function normalizeNote(n, i) {
    if (!n || !isPitch(n.pitch)) fail('nota[' + i + '] pitch inválido');
    if (typeof n.beat !== 'number' || !isFinite(n.beat) || n.beat < 0) {
      fail('nota[' + i + '] beat inválido');
    }
    var dur = (typeof n.dur === 'number' && n.dur > 0) ? n.dur : 1;
    return { pitch: n.pitch, beat: n.beat, dur: dur };
  }

  function normalizeBar(bar, idx) {
    if (!bar || typeof bar !== 'object') fail('loop[' + idx + '] inválido');
    var kind = bar.kind;
    if (!KINDS[kind]) fail('loop[' + idx + '] kind inválido: ' + kind);
    var notes = Array.isArray(bar.notes) ? bar.notes.map(normalizeNote) : [];
    if (kind === 'hole' && notes.length) {
      // permitido pero M0 trata hole.notes como ignoradas al resolver
    }
    return {
      i: (typeof bar.i === 'number') ? bar.i : idx,
      kind: kind,
      notes: notes
    };
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

    return {
      id: String(raw.id),
      title: String(raw.title),
      bpm: bpm,
      timeSig: timeSig,
      roomKey: String(raw.roomKey),
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

  /**
   * Compás global 0..∞: primero setup, luego loop que se repite.
   */
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

  function upcoming(chart, fromBar, count) {
    count = count || 4;
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(barAt(chart, fromBar + i));
    }
    return out;
  }

  // El JSON nombra el tiempo (0, 1, 2, 3). El golpe — cabeza, melodía,
  // metrónomo y ventana — cae en el centro de ese tiempo, el mismo punto
  // que las marcas 1–2–3–4 del Ataque. Así el compás no cambia de fase
  // al entrar en Defiende. Las ventanas siguen siendo ±0.15 / ±0.45
  // alrededor de ese centro.
  var BEAT_CENTER = 0.5;

  function hitOnset(beat) {
    var b = (typeof beat === 'number' && isFinite(beat)) ? beat : 0;
    return b + BEAT_CENTER;
  }

  // Índice del último centro ya alcanzado. −1 antes del primero.
  function centerReached(beat) {
    if (typeof beat !== 'number' || !isFinite(beat)) return -1;
    return Math.floor(beat - BEAT_CENTER + 1e-6);
  }

  return {
    parse: parse,
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
