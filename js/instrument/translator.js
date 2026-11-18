'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InstrumentTranslator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT_TO_SHARP = {
    Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
    'C♭': 'B', 'D♭': 'C#', 'E♭': 'D#', 'F♭': 'E', 'G♭': 'F#', 'A♭': 'G#', 'B♭': 'A#'
  };

  var KEY_MAP = {
    q: 'C3', '2': 'C#3', m: 'D3', '3': 'D#3', ',': 'E3', '.': 'F3', '4': 'F#3',
    v: 'G3', r: 'G#3', b: 'A3', i: 'A#3', n: 'B3',
    a: 'C4', w: 'C#4', s: 'D4', e: 'D#4', d: 'E4',
    f: 'F4', t: 'F#4', g: 'G4', y: 'G#4', h: 'A4',
    u: 'A#4', j: 'B4', k: 'C5', o: 'C#5', l: 'D5', p: 'D#5', 'ñ': 'E5', ';': 'E5',
    "'": 'F5', z: 'F#5', x: 'G5', c: 'A5'
  };

  var KEY_LABELS = (function () {
    var labels = [];
    var keyByPitch = {};
    var k;
    for (k in KEY_MAP) {
      if (Object.prototype.hasOwnProperty.call(KEY_MAP, k) && !keyByPitch[KEY_MAP[k]]) {
        keyByPitch[KEY_MAP[k]] = k;
      }
    }
    var pc = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var midi;
    for (midi = 36; midi <= 96; midi++) {
      var name = pc[midi % 12] + (Math.floor(midi / 12) - 1);
      var key = keyByPitch[name] || '';
      labels.push({ key: key, pitch: name });
    }
    return labels;
  })();


  function normalizeName(raw) {
    if (typeof raw === 'number' && isFinite(raw)) return midiToName(raw);
    if (raw == null) return null;
    var s = String(raw).trim();
    var m = /^([A-Ga-g])([#b♭♯]?)(-?\d+)$/.exec(s);
    if (!m) return null;
    var letter = m[1].toUpperCase();
    var acc = m[2].replace('♯', '#').replace('♭', 'b');
    var oct = m[3];
    if (acc === 'b') {
      var mapped = FLAT_TO_SHARP[letter + 'b'];
      if (mapped) {
        letter = mapped.replace('#', '');
        acc = mapped.indexOf('#') >= 0 ? '#' : '';
        if (letter === 'B' && m[1].toUpperCase() === 'C') {
        }
      }
    }
    var name = letter + acc;
    if (FLAT_TO_SHARP[name]) name = FLAT_TO_SHARP[name];
    return name + oct;
  }

  function pitchToMidi(pitch) {
    var name = normalizeName(pitch);
    if (!name) return null;
    var m = /^([A-G]#?)(-?\d+)$/.exec(name);
    if (!m) return null;
    var pc = PC_SHARP.indexOf(m[1]);
    if (pc < 0) return null;
    var oct = parseInt(m[2], 10);
    return (oct + 1) * 12 + pc;
  }

  function midiToName(midi) {
    if (typeof midi !== 'number' || !isFinite(midi)) return null;
    var m = Math.round(midi);
    if (m < 0 || m > 127) return null;
    var pc = ((m % 12) + 12) % 12;
    var oct = Math.floor(m / 12) - 1;
    return PC_SHARP[pc] + oct;
  }

  function pitchClass(pitch) {
    var midi = pitchToMidi(pitch);
    if (midi == null) return null;
    return ((midi % 12) + 12) % 12;
  }

  function hzForPitch(pitch, a4) {
    a4 = a4 || 440;
    var midi = pitchToMidi(pitch);
    if (midi == null) return null;
    return a4 * Math.pow(2, (midi - 69) / 12);
  }

  function beatsPerBar(timeSig) {
    var num = 4;
    var den = 4;
    if (Array.isArray(timeSig) && timeSig.length >= 2) {
      num = timeSig[0] || 4;
      den = timeSig[1] || 4;
    }
    return num * (4 / den);
  }

  function quarterMs(bpm) {
    var b = (typeof bpm === 'number' && bpm > 0) ? bpm : 60;
    return 60000 / b;
  }

  function create(opts) {
    opts = opts || {};
    var bpm = (typeof opts.bpm === 'number' && opts.bpm > 0) ? opts.bpm : 60;
    var timeSig = opts.timeSig || [4, 4];
    var startTimeMs = (typeof opts.startTimeMs === 'number') ? opts.startTimeMs : null;
    var held = {};

    function bpb() {
      return beatsPerBar(timeSig);
    }

    function qMs() {
      return quarterMs(bpm);
    }

    function beatsAt(timeMs) {
      if (startTimeMs == null) return 0;
      var t = (typeof timeMs === 'number' && isFinite(timeMs)) ? timeMs : startTimeMs;
      return (t - startTimeMs) / qMs();
    }

    function measureAt(timeMs) {
      var beats = beatsAt(timeMs);
      var n = bpb();
      var barIndex = Math.floor(beats / n + 1e-10);
      if (barIndex < 0) barIndex = 0;
      var barStartBeat = barIndex * n;
      var beatInBar = beats - barStartBeat;
      if (beatInBar < 0) beatInBar = 0;
      return {
        barIndex: barIndex,
        beatInBar: beatInBar,
        barStartBeat: barStartBeat,
        barEndBeat: barStartBeat + n,
        beats: beats
      };
    }

    function noteOn(pitch, timeMs) {
      var name = normalizeName(pitch);
      var midi = pitchToMidi(name);
      var meas = measureAt(timeMs);
      if (name) held[name] = { pitch: name, midi: midi, timeMs: timeMs, beat: meas.beats };
      return {
        type: 'on',
        pitch: name,
        midi: midi,
        timeMs: timeMs,
        beat: meas.beats,
        beatInBar: meas.beatInBar,
        barIndex: meas.barIndex
      };
    }

    function noteOff(pitch, timeMs) {
      var name = normalizeName(pitch);
      var midi = pitchToMidi(name);
      var meas = measureAt(timeMs);
      var start = name ? held[name] : null;
      if (name) delete held[name];
      var durBeats = start ? Math.max(0, meas.beats - start.beat) : 0;
      return {
        type: 'off',
        pitch: name,
        midi: midi,
        timeMs: timeMs,
        beat: meas.beats,
        beatInBar: meas.beatInBar,
        barIndex: meas.barIndex,
        durBeats: durBeats
      };
    }

    return {
      noteOn: noteOn,
      noteOff: noteOff,
      beatsAt: beatsAt,
      measureAt: measureAt,
      beatsPerBar: bpb,
      quarterMs: qMs,
      held: function () { return Object.keys(held); },
      setStart: function (t) { startTimeMs = t; },
      setBpm: function (b) { if (typeof b === 'number' && b > 0) bpm = b; },
      setTimeSig: function (ts) { if (ts) timeSig = ts; },
      getStart: function () { return startTimeMs; }
    };
  }

  function gateMic(events, sample, prev) {
    var state = {
      level: prev && typeof prev.level === 'number' ? prev.level : null,
      floorDb: prev && typeof prev.floorDb === 'number' ? prev.floorDb : null,
      lowAt: prev && typeof prev.lowAt === 'number' ? prev.lowAt : 0,
      lowMidi: prev && typeof prev.lowMidi === 'number' ? prev.lowMidi : null,
      attackUntil: prev && typeof prev.attackUntil === 'number' ? prev.attackUntil : 0
    };
    var db = sample && typeof sample.db === 'number' && isFinite(sample.db) ? sample.db : -120;
    var now = sample && typeof sample.now === 'number' && isFinite(sample.now) ? sample.now : 0;
    var musical = false;
    if (state.level == null) {
      state.level = db;
      state.floorDb = db;
    } else {
      var prevLevel = state.level;
      var steady = Math.abs(db - prevLevel) < 5;
      state.level = prevLevel * 0.8 + db * 0.2;
      if (steady || db < state.floorDb) state.floorDb = state.floorDb * 0.75 + db * 0.25;
      var rise = db - state.floorDb;
      var attack = !steady && rise >= 8 && db >= -58;
      if (attack) state.attackUntil = now + 240;
      musical = (attack || now <= state.attackUntil || rise >= 8) && db >= -58;
    }
    var list = events || [];
    var bestLow = -1;
    var bestAt = -1;
    var i;
    var ev;
    var midi;
    for (i = 0; i < list.length; i++) {
      ev = list[i];
      if (!ev || ev.type !== 'on') continue;
      midi = typeof ev.midi === 'number' ? ev.midi : pitchToMidi(ev.pitch);
      if (midi != null && midi < 60 && midi > bestLow) {
        bestLow = midi;
        bestAt = i;
      }
    }
    var out = [];
    var keptLow = false;
    for (i = 0; i < list.length; i++) {
      ev = list[i];
      if (!ev) continue;
      if (ev.type !== 'on') {
        out.push(ev);
        continue;
      }
      if (!musical) continue;
      midi = typeof ev.midi === 'number' ? ev.midi : pitchToMidi(ev.pitch);
      if (midi != null && midi < 60) {
        if (i !== bestAt || keptLow) continue;
        if (now - state.lowAt < 360) continue;
        state.lowAt = now;
        state.lowMidi = midi;
        keptLow = true;
      }
      out.push(ev);
    }
    var readingMidi = sample && typeof sample.midi === 'number' ? sample.midi : null;
    var live = false;
    if (musical) {
      if (readingMidi == null || readingMidi >= 60) live = true;
      else live = keptLow || (state.lowMidi === readingMidi && now - state.lowAt < 700);
    }
    return { events: out, state: state, live: live };
  }

  return {
    create: create,
    KEY_MAP: KEY_MAP,
    KEY_LABELS: KEY_LABELS,
    normalizeName: normalizeName,
    pitchToMidi: pitchToMidi,
    midiToName: midiToName,
    pitchClass: pitchClass,
    hzForPitch: hzForPitch,
    beatsPerBar: beatsPerBar,
    quarterMs: quarterMs,
    gateMic: gateMic
  };
});
