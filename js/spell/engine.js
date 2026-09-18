// js/spell/engine.js — modo → acción; grado → elemento; círculo de quintas vs sala.
// Pura, sin DOM. UMD: module.exports + window.SpellEngine.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var T = require('../instrument/translator.js');
    module.exports = factory(T);
  } else {
    root.SpellEngine = factory(root.InstrumentTranslator);
  }
})(typeof self !== 'undefined' ? self : this, function (Translator) {
  'use strict';

  var MODE_ACTION = { major: 'attack', minor: 'buff', pentatonic: 'heal' };

  var ELEMENTS = [
    { id: 'tierra', icon: '🌍', label: 'Tierra', degree: 1 },
    { id: 'agua', icon: '💧', label: 'Agua', degree: 2 },
    { id: 'fuego', icon: '🔥', label: 'Fuego', degree: 3 },
    { id: 'aire', icon: '🌬️', label: 'Aire', degree: 4 },
    { id: 'trueno', icon: '⚡', label: 'Trueno', degree: 5 },
    { id: 'hielo', icon: '❄️', label: 'Hielo', degree: 6 },
    { id: 'luz', icon: '✨', label: 'Luz', degree: 7 }
  ];

  // Círculo de quintas por pitch class: C G D A E B F# C# G# D# A# F
  var FIFTHS_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  var DEGREE_SEMITONE = [null, 0, 2, 4, 5, 7, 9, 11];
  var REL_DEGREE = { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7, 3: 3, 8: 6, 10: 7 };

  var BASE_ATTACK = 2;
  var BASE_HEAL = 3;
  var MISS_DAMAGE = 3;
  var HOLE_DAMAGE = 3;
  var HIT_WINDOW_BEATS = 0.45;
  var MIN_ACCURACY = 0.5;
  var FULL_ACCURACY = 0.75;

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var MINOR = [0, 2, 3, 5, 7, 8, 10];
  var PENTA = [0, 2, 4, 7, 9];

  function unique(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] == null || seen[arr[i]]) continue;
      seen[arr[i]] = true;
      out.push(arr[i]);
    }
    return out;
  }

  function keyToPc(key) {
    if (typeof key === 'number') return ((key % 12) + 12) % 12;
    var midi = Translator.pitchToMidi(String(key) + '4');
    if (midi == null) {
      midi = Translator.pitchToMidi(key);
    }
    if (midi == null) return 0;
    return ((midi % 12) + 12) % 12;
  }

  function pcToKeyName(pc) {
    var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[((pc % 12) + 12) % 12];
  }

  function circleIndex(key) {
    var pc = keyToPc(key);
    var i = FIFTHS_PC.indexOf(pc);
    return i < 0 ? 0 : i;
  }

  function circleDistance(a, b) {
    var ia = circleIndex(a);
    var ib = circleIndex(b);
    var d = Math.abs(ia - ib);
    return Math.min(d, 12 - d);
  }

  function roomMultiplier(dist) {
    if (dist === 0) return 1.5;
    if (dist <= 2) return 1.0;
    if (dist <= 4) return 0.75;
    return 0.5;
  }

  function elementForDegree(degree) {
    var d = degree | 0;
    if (d < 1) d = 1;
    if (d > 7) d = ((d - 1) % 7) + 1;
    return ELEMENTS[d - 1];
  }

  function modeToAction(mode) {
    return MODE_ACTION[mode] || null;
  }

  function subsetOf(rel, scale) {
    for (var i = 0; i < rel.length; i++) {
      if (scale.indexOf(rel[i]) < 0) return false;
    }
    return rel.length > 0;
  }

  function has(rel, n) {
    return rel.indexOf(n) >= 0;
  }

  function classifyMode(rel) {
    if (!rel.length) return null;
    if (has(rel, 3) && !has(rel, 4)) return 'minor';
    if (has(rel, 5) || has(rel, 11) || has(rel, 10) || has(rel, 8)) {
      if (subsetOf(rel, MAJOR) && !has(rel, 3)) return 'major';
      if (subsetOf(rel, MINOR)) return 'minor';
    }
    if (subsetOf(rel, PENTA) && (has(rel, 7) || has(rel, 9)) && !has(rel, 5) && !has(rel, 11)) {
      return 'pentatonic';
    }
    if (subsetOf(rel, MAJOR)) return 'major';
    if (subsetOf(rel, MINOR)) return 'minor';
    if (subsetOf(rel, PENTA)) return 'pentatonic';
    if (has(rel, 4)) return 'major';
    if (has(rel, 3)) return 'minor';
    return 'major';
  }

  function degreeFromRel(rel) {
    if (has(rel, 0)) return 1;
    for (var i = 0; i < rel.length; i++) {
      if (REL_DEGREE[rel[i]]) return REL_DEGREE[rel[i]];
    }
    return 1;
  }

  function classify(pitches, roomKey) {
    roomKey = roomKey || 'C';
    var names = (pitches || []).map(function (p) {
      return typeof p === 'object' && p ? p.pitch : p;
    }).map(Translator.normalizeName).filter(Boolean);
    var pcs = unique(names.map(Translator.pitchClass).filter(function (x) { return x != null; }));
    var tonicPc = keyToPc(roomKey);
    var rel = pcs.map(function (pc) { return (pc - tonicPc + 12) % 12; }).sort(function (a, b) { return a - b; });
    var mode = classifyMode(rel);
    if (!mode) {
      return {
        mode: null,
        action: null,
        tonic: roomKey,
        element: elementForDegree(1),
        degree: 1,
        multiplier: 1,
        circleDistance: 0,
        pitches: names
      };
    }
    var degree = degreeFromRel(rel);
    var spellPc = (tonicPc + DEGREE_SEMITONE[degree]) % 12;
    var spellKey = pcToKeyName(spellPc);
    var dist = circleDistance(spellKey, roomKey);
    var mult = roomMultiplier(dist);
    return {
      mode: mode,
      action: modeToAction(mode),
      tonic: spellKey,
      roomKey: roomKey,
      element: elementForDegree(degree),
      degree: degree,
      multiplier: mult,
      circleDistance: dist,
      pitches: names
    };
  }

  function pitchEq(a, b) {
    var ma = Translator.pitchToMidi(a);
    var mb = Translator.pitchToMidi(b);
    if (ma == null || mb == null) return false;
    return ma === mb;
  }

  /**
   * Empareja notas tocadas vs esperadas (mismo pitch, onset ± hitWindow).
   */
  function matchNotes(played, expected, hitWindow) {
    hitWindow = (typeof hitWindow === 'number') ? hitWindow : HIT_WINDOW_BEATS;
    var exp = (expected || []).map(function (n, i) {
      return { pitch: n.pitch, beat: n.beat, dur: n.dur, i: i, hit: false };
    });
    var extras = [];
    var hits = [];
    var list = (played || []).slice().sort(function (a, b) {
      return (a.beatInBar || 0) - (b.beatInBar || 0);
    });

    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var beat = (typeof p.beatInBar === 'number') ? p.beatInBar : p.beat;
      var best = -1;
      var bestDist = Infinity;
      for (var j = 0; j < exp.length; j++) {
        if (exp[j].hit) continue;
        if (!pitchEq(p.pitch, exp[j].pitch)) continue;
        var d = Math.abs(beat - exp[j].beat);
        if (d <= hitWindow && d < bestDist) {
          bestDist = d;
          best = j;
        }
      }
      if (best >= 0) {
        exp[best].hit = true;
        hits.push({ expected: exp[best], played: p, error: bestDist });
      } else {
        extras.push(p);
      }
    }

    var missed = exp.filter(function (e) { return !e.hit; });
    return {
      hits: hits,
      missed: missed,
      extras: extras,
      hitCount: hits.length,
      expectedCount: exp.length
    };
  }

  function buffMultiplier(buffs) {
    var m = 1;
    var list = buffs || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'atk') m += list[i].amount || 0;
    }
    return m;
  }

  function resolveDefend(played, expected, roomKey, opts) {
    opts = opts || {};
    var matched = matchNotes(played, expected, opts.hitWindowBeats);
    var expectedCount = matched.expectedCount;
    var accuracy = expectedCount ? (matched.hitCount / expectedCount) : 0;
    if (matched.extras.length >= 2) accuracy = Math.max(0, accuracy - 0.25);

    var spell = classify(played, roomKey);
    var ok = accuracy >= MIN_ACCURACY && expectedCount > 0;

    if (!ok) {
      return {
        ok: false,
        kind: 'defend-miss',
        accuracy: accuracy,
        spell: spell,
        hits: matched.hitCount,
        expected: expectedCount,
        extras: matched.extras.length,
        missed: matched.missed.length,
        bossDamage: 0,
        heal: 0,
        buff: null,
        playerDamage: MISS_DAMAGE
      };
    }

    var strength = accuracy >= FULL_ACCURACY ? 1 : 0.5;
    var roomMult = spell.multiplier || 1;
    var buffMult = buffMultiplier(opts.buffs);
    var bossDamage = 0;
    var heal = 0;
    var buff = null;

    if (spell.action === 'attack') {
      bossDamage = Math.max(1, Math.round(BASE_ATTACK * roomMult * buffMult * strength));
    } else if (spell.action === 'heal') {
      heal = Math.max(1, Math.round(BASE_HEAL * strength));
    } else if (spell.action === 'buff') {
      buff = { id: 'atk', label: 'ATQ+', amount: 0.5, remaining: 2 };
    }

    return {
      ok: true,
      kind: 'defend-hit',
      accuracy: accuracy,
      spell: spell,
      hits: matched.hitCount,
      expected: expectedCount,
      extras: matched.extras.length,
      missed: matched.missed.length,
      bossDamage: bossDamage,
      heal: heal,
      buff: buff,
      playerDamage: 0,
      strength: strength
    };
  }

  function resolveHole(played) {
    var n = (played || []).length;
    if (n > 0) {
      return {
        ok: false,
        kind: 'hole-miss',
        accuracy: 0,
        spell: null,
        hits: 0,
        expected: 0,
        extras: n,
        missed: 0,
        bossDamage: 0,
        heal: 0,
        buff: null,
        playerDamage: HOLE_DAMAGE
      };
    }
    return {
      ok: true,
      kind: 'hole-clear',
      accuracy: 1,
      spell: null,
      hits: 0,
      expected: 0,
      extras: 0,
      missed: 0,
      bossDamage: 0,
      heal: 0,
      buff: null,
      playerDamage: 0
    };
  }

  function resolveSetup() {
    return {
      ok: true,
      kind: 'setup',
      accuracy: 1,
      spell: null,
      hits: 0,
      expected: 0,
      extras: 0,
      missed: 0,
      bossDamage: 0,
      heal: 0,
      buff: null,
      playerDamage: 0
    };
  }

  return {
    classify: classify,
    matchNotes: matchNotes,
    resolveDefend: resolveDefend,
    resolveHole: resolveHole,
    resolveSetup: resolveSetup,
    circleDistance: circleDistance,
    roomMultiplier: roomMultiplier,
    elementForDegree: elementForDegree,
    modeToAction: modeToAction,
    keyToPc: keyToPc,
    ELEMENTS: ELEMENTS,
    MODE_ACTION: MODE_ACTION,
    BASE_ATTACK: BASE_ATTACK,
    BASE_HEAL: BASE_HEAL,
    MISS_DAMAGE: MISS_DAMAGE,
    HOLE_DAMAGE: HOLE_DAMAGE,
    HIT_WINDOW_BEATS: HIT_WINDOW_BEATS,
    MIN_ACCURACY: MIN_ACCURACY,
    FULL_ACCURACY: FULL_ACCURACY
  };
});
