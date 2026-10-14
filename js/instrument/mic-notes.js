// js/instrument/mic-notes.js — hops de YIN → NoteOn/NoteOff monofónicos.
// Adaptado del criterio de piano-game (corrida mínima + hueco = otra nota),
// sin el EventStream polifónico. Puro, sin DOM.
// UMD: module.exports + window.MicNotes.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MicNotes = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_RUN = 2;
  var RELEASE_GAPS = 3;
  var HOP_MS = 20;
  var GATE_DB = -74; // v0.1.10: -50 cortaba un piano mf a 1-2 m del iPad (≈-55 dBFS sin AGC)
  var FLOOR_MARGIN_DB = 8; // la nota debe superar el ruido de fondo
  var VOTE_N = 3;   // v0.1.10: ventana corta (latencia ~60 ms)
  var VOTE_MIN = 2; // votos para aceptar una nota
  var MIN_MIDI = 48; // C3
  var MAX_MIDI = 84; // C6

  function create() {
    return {
      heldMidi: null,
      heldName: null,
      candMidi: null,
      candName: null,
      run: 0,
      gap: 0,
      votes: [],
      lastDb: -120
    };
  }

  function reset(st) {
    if (!st) return;
    st.heldMidi = null;
    st.heldName = null;
    st.candMidi = null;
    st.candName = null;
    st.run = 0;
    st.gap = 0;
    st.votes = [];
    st.lastDb = -120;
    st.floorDb = null;
  }

  // Un frame crudo → observación suavizada {midi, name} (o nulls).
  // Votación por mayoría en los últimos VOTE_N frames; un salto de octava
  // respecto a la nota sostenida solo se acepta con un nuevo ataque (+6 dB).
  function observe(st, buf, sampleRate, Pitch) {
    var db = rmsDb(buf);
    var onset = db - st.lastDb >= 6;
    st.lastDb = db;
    // v0.1.10: piso de ruido = nivel de los frames SIN tono (ruido del cuarto).
    // Antes seguía el mínimo de todo, así que bajaba junto con la cola de cada
    // nota y una nota nueva tenía que superar esa cola por 5 dB: casi ninguna
    // pasaba al tocar seguido. Los frames con tono claro ya no lo mueven.
    var raw = null, rawName = null, res = null;
    if (db >= GATE_DB) res = Pitch.detectPitch(buf, sampleRate, { maxLag: Math.ceil(sampleRate / 120) });
    var tonal = !!(res && res.freq && res.clarity >= 0.6);
    // Solo frames claramente sin tono (o bajo la compuerta) mueven el piso;
    // dos notas sonando juntas bajan la claridad pero no son ruido. Tope -50 dBFS.
    var noisy = !res || !res.freq || res.clarity < 0.35;
    if (noisy) {
      if (st.floorDb == null || db < st.floorDb) st.floorDb = Math.min(db, -50);
      else if (st.floorDb < -50) st.floorDb += 0.03; // sube ~1 dB/s
    }
    var floorOk = st.floorDb == null || db >= st.floorDb + FLOOR_MARGIN_DB;
    if (tonal && floorOk) {
      var note = Pitch.noteFromFreq(res.freq, 440);
      var nm = accept(note, res.clarity);
      if (nm) { raw = note.midi; rawName = nm; }
    }
    if (onset) st.votes = [];
    st.votes.push(raw == null ? null : { midi: raw, name: rawName });
    if (st.votes.length > VOTE_N) st.votes.shift();
    var count = {}, best = null, bestN = 0, i, v;
    for (i = 0; i < st.votes.length; i++) {
      v = st.votes[i];
      if (!v) continue;
      count[v.midi] = (count[v.midi] || 0) + 1;
      if (count[v.midi] > bestN) { bestN = count[v.midi]; best = v; }
    }
    var need = Math.min(VOTE_MIN, Math.max(2, st.votes.length));
    if (!best || bestN < need) {
      // Sin consenso: si la nota sostenida aún aparece, mantenerla.
      if (st.heldMidi != null && raw != null && count[st.heldMidi]) {
        return { midi: st.heldMidi, name: st.heldName, db: db };
      }
      return { midi: null, name: null, db: db };
    }
    // Legato: un cambio de altura estable es nota nueva aunque no suba el
    // volumen. Solo la octava exacta de la nota sostenida (cola que salta de
    // armónico) pide un ataque nuevo o ~300 ms estable.
    if (st.heldMidi != null && best.midi !== st.heldMidi &&
        Math.abs(best.midi - st.heldMidi) % 12 === 0 && !onset) {
      st.octRun = (st.octMidi === best.midi) ? (st.octRun || 0) + 1 : 1;
      st.octMidi = best.midi;
      if (st.octRun < 15) return { midi: st.heldMidi, name: st.heldName, db: db };
    } else { st.octRun = 0; st.octMidi = null; }
    return { midi: best.midi, name: best.name, db: db };
  }

  function rmsDb(buffer) {
    if (!buffer || !buffer.length) return -120;
    var sum = 0;
    var i;
    for (i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    var rms = Math.sqrt(sum / buffer.length);
    return 20 * Math.log10(rms + 1e-12);
  }

  function accept(note, clarity, opts) {
    opts = opts || {};
    var minMidi = opts.minMidi == null ? MIN_MIDI : opts.minMidi;
    var maxMidi = opts.maxMidi == null ? MAX_MIDI : opts.maxMidi;
    var maxCents = opts.maxCents == null ? 40 : opts.maxCents;
    var strict = opts.strict == null ? 0.6 : opts.strict;
    var relaxed = opts.relaxed == null ? 0.6 : opts.relaxed;
    if (!note || typeof note.midi !== 'number') return null;
    if (note.midi < minMidi || note.midi > maxMidi) return null;
    if (typeof note.cents === 'number' && Math.abs(note.cents) > maxCents) return null;
    var th = note.midi >= 72 ? relaxed : strict;
    if (typeof clarity === 'number' && clarity < th) return null;
    if (!note.name || typeof note.octave !== 'number') return null;
    return note.name + note.octave;
  }

  // El altavoz propio (OSK, jefe, metrónomo) no debe volver a entrar por el mic.
  // Bloquea la fundamental, el semitono vecino y la octava.
  function isBlocked(blocks, midi, now) {
    if (!blocks || midi == null || typeof now !== 'number') return false;
    var i;
    for (i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || now >= b.until) continue;
      var d = midi - b.midi;
      if (d < 0) d = -d;
      if (d === 0 || d === 1 || d === 12) return true;
    }
    return false;
  }

  function hop(st, obs) {
    var on = null;
    var off = null;
    obs = obs || {};
    var midi = obs.midi;
    var name = obs.name;
    if (midi == null || !name) {
      st.candMidi = null;
      st.candName = null;
      st.run = 0;
      st.gap += 1;
      if (st.heldMidi != null && st.gap >= RELEASE_GAPS) {
        off = st.heldName;
        st.heldMidi = null;
        st.heldName = null;
        st.gap = 0;
      }
      return { on: on, off: off };
    }
    st.gap = 0;
    if (st.heldMidi === midi) {
      st.candMidi = null;
      st.candName = null;
      st.run = 0;
      return { on: null, off: null };
    }
    if (st.candMidi === midi) st.run += 1;
    else {
      st.candMidi = midi;
      st.candName = name;
      st.run = 1;
    }
    if (st.run >= MIN_RUN) {
      if (st.heldName) off = st.heldName;
      st.heldMidi = midi;
      st.heldName = name;
      on = name;
      st.candMidi = null;
      st.candName = null;
      st.run = 0;
    }
    return { on: on, off: off };
  }

  // Varias fuentes (osk, tecla, MIDI, mic) comparten un NoteOn de combate.
  function mergePress(heldMap, pitch, source) {
    var slot = heldMap[pitch];
    var fresh = !slot;
    if (!slot) {
      slot = {};
      heldMap[pitch] = slot;
    }
    var added = !slot[source];
    slot[source] = true;
    return {
      fresh: fresh,
      added: added,
      sound: added && source !== 'mic',
      combat: fresh
    };
  }

  function mergeRelease(heldMap, pitch, source) {
    var slot = heldMap[pitch];
    if (!slot) return { released: false };
    if (source) delete slot[source];
    else {
      delete heldMap[pitch];
      return { released: true };
    }
    var left = 0;
    var k;
    for (k in slot) {
      if (Object.prototype.hasOwnProperty.call(slot, k)) left += 1;
    }
    if (left) return { released: false };
    delete heldMap[pitch];
    return { released: true };
  }

  function sessionType(micOn) {
    return micOn ? 'play-and-record' : 'playback';
  }

  function denyMessage(errName) {
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
      return 'Permiso de micrófono denegado. Sigue con el teclado.';
    }
    if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      return 'No se encontró un micrófono. Usa el teclado.';
    }
    if (errName === 'NotSupportedError' || errName === 'TypeError') {
      return 'Este navegador no permite el micrófono. Usa el teclado.';
    }
    return 'No se pudo abrir el micrófono. Usa el teclado.';
  }

  function statusLine(opts) {
    opts = opts || {};
    var base = 'Micrófono activo · una nota a la vez. La melodía del jefe no suena, para que no entre por el mic. Ruido y acordes pueden fallar.';
    if (opts.ios) {
      base += ' En iPhone o iPad, si el altavoz se calla, apaga el micrófono.';
    }
    return base;
  }

  return {
    create: create,
    reset: reset,
    rmsDb: rmsDb,
    observe: observe,
    accept: accept,
    isBlocked: isBlocked,
    hop: hop,
    mergePress: mergePress,
    mergeRelease: mergeRelease,
    sessionType: sessionType,
    denyMessage: denyMessage,
    statusLine: statusLine,
    MIN_RUN: MIN_RUN,
    RELEASE_GAPS: RELEASE_GAPS,
    HOP_MS: HOP_MS,
    GATE_DB: GATE_DB,
    MIN_MIDI: MIN_MIDI,
    MAX_MIDI: MAX_MIDI
  };
});
