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
  var HOP_MS = 32;
  var GATE_DB = -42;
  var MIN_MIDI = 48; // C3
  var MAX_MIDI = 84; // C6

  function create() {
    return {
      heldMidi: null,
      heldName: null,
      candMidi: null,
      candName: null,
      run: 0,
      gap: 0
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
    var strict = opts.strict == null ? 0.86 : opts.strict;
    var relaxed = opts.relaxed == null ? 0.78 : opts.relaxed;
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
