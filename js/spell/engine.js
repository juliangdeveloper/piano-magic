// js/spell/engine.js — 12 claves (círculo de quintas) → elemento; ×sala por pasos;
// modo (mayor/menor/pent) desde ventana corta de pitch classes. Pura, sin DOM.
// UMD: module.exports + window.SpellEngine.
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

  // Tonalidad → elemento (12 claves del círculo de quintas; NO grados I–VII).
  // Enarmónicos: Gb=F#, C#=Db, D#=Eb, G#=Ab, A#=Bb.
  var KEY_ELEMENTS = [
    { pc: 0, key: 'C', id: 'agua', icon: '💧', label: 'Agua' },
    { pc: 7, key: 'G', id: 'planta', icon: '🌿', label: 'Planta' },
    { pc: 2, key: 'D', id: 'electrico', icon: '⚡', label: 'Eléctrico' },
    { pc: 9, key: 'A', id: 'volador', icon: '🪶', label: 'Volador' },
    { pc: 4, key: 'E', id: 'lucha', icon: '👊', label: 'Lucha' },
    { pc: 11, key: 'B', id: 'dragon', icon: '🐉', label: 'Dragón' },
    { pc: 6, key: 'F#', id: 'fuego', icon: '🔥', label: 'Fuego' },
    { pc: 1, key: 'Db', id: 'hielo', icon: '❄️', label: 'Hielo' },
    { pc: 8, key: 'Ab', id: 'tierra', icon: '🌍', label: 'Tierra' },
    { pc: 3, key: 'Eb', id: 'roca', icon: '🪨', label: 'Roca' },
    { pc: 10, key: 'Bb', id: 'psiquico', icon: '🔮', label: 'Psíquico' },
    { pc: 5, key: 'F', id: 'hada', icon: '✨', label: 'Hada' }
  ];

  var ELEMENTS_BY_PC = new Array(12);
  for (var ei = 0; ei < KEY_ELEMENTS.length; ei++) {
    ELEMENTS_BY_PC[KEY_ELEMENTS[ei].pc] = KEY_ELEMENTS[ei];
  }

  // Círculo de quintas por pitch class: C G D A E B F# Db Ab Eb Bb F
  var FIFTHS_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  var PC_KEY_NAME = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  var BASE_ATTACK = 2;
  var BASE_HEAL = 3;
  var MISS_DAMAGE = 3;
  var HIT_WINDOW_BEATS = 0.45;
  var MIN_ACCURACY = 0.5;
  var FULL_ACCURACY = 0.75;
  var MIN_GESTURE_PCS = 2;

  // Ventana de improvisación en el hole (ataque en la UI): todos los NoteOn del compás (1 barra).
  var HOLE_WINDOW_BARS = 1;
  // Subconjunto visual del hit de combate. No cambia Perfect/Partial/Fail del compás.
  var PERFECT_WINDOW_BEATS = 0.15;

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var MINOR = [0, 2, 3, 5, 7, 8, 10];
  var PENTA = [0, 2, 4, 7, 9];

  var SALA_MULT = [1.0, 0.85, 0.7, 0.5, 0.35, 0.2, 0];

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
    return PC_KEY_NAME[((pc % 12) + 12) % 12];
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
    var d = dist | 0;
    if (d < 0) d = 0;
    if (d > 6) d = 6;
    return SALA_MULT[d];
  }

  function elementForKey(key) {
    return ELEMENTS_BY_PC[keyToPc(key)] || KEY_ELEMENTS[0];
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

  /**
   * Clasifica modo relativo a una tónica ya elegida.
   * 1) 3ª menor sin 3ª mayor → minor
   * 2) pentatónica: subconjunto {0,2,4,7,9} con 2ª o 6ª (color pent) y 5ª/6ª, sin 4ª/7ª
   *    (un acorde mayor 0-4-7 solo NO es pent: es major)
   * 3) fragmento mayor (p.ej. 0-2-4 / 0-4-7) o 4ª/7ª mayor → major
   */
  function classifyMode(rel) {
    if (!rel.length) return null;
    if (has(rel, 3) && !has(rel, 4)) return 'minor';
    var pentaColor = subsetOf(rel, PENTA)
      && (has(rel, 2) || has(rel, 9))
      && (has(rel, 7) || has(rel, 9))
      && !has(rel, 5) && !has(rel, 11) && !has(rel, 3);
    if (pentaColor) return 'pentatonic';
    if (has(rel, 5) || has(rel, 11) || has(rel, 10) || has(rel, 8)) {
      if (subsetOf(rel, MAJOR) && !has(rel, 3)) return 'major';
      if (subsetOf(rel, MINOR)) return 'minor';
    }
    if (subsetOf(rel, MAJOR)) return 'major';
    if (subsetOf(rel, MINOR)) return 'minor';
    if (subsetOf(rel, PENTA)) return 'pentatonic';
    if (has(rel, 4)) return 'major';
    if (has(rel, 3)) return 'minor';
    return null;
  }

  function pitchNames(pitches) {
    return (pitches || []).map(function (p) {
      return typeof p === 'object' && p ? p.pitch : p;
    }).map(Translator.normalizeName).filter(Boolean);
  }

  function pcsFromNames(names) {
    return unique(names.map(Translator.pitchClass).filter(function (x) { return x != null; }));
  }

  /**
   * Infiera tónica + modo del conjunto de pitch classes de la ventana.
   * Prueba las 12 tónicas; puntúa presencia de tónica, 3ª del modo, 1ª nota y roomKey.
   */
  function inferGesture(names, roomKey) {
    var pcs = pcsFromNames(names);
    if (pcs.length < MIN_GESTURE_PCS) {
      return {
        mode: null,
        action: null,
        tonicPc: null,
        tonic: null,
        pcs: pcs,
        names: names
      };
    }

    var roomPc = keyToPc(roomKey || 'C');
    var firstPc = Translator.pitchClass(names[0]);
    var best = null;

    for (var t = 0; t < 12; t++) {
      var rel = pcs.map(function (pc) { return (pc - t + 12) % 12; }).sort(function (a, b) { return a - b; });
      var mode = classifyMode(rel);
      if (!mode) continue;
      var score = rel.length;
      if (has(rel, 0)) score += 3;
      if (mode === 'minor' && has(rel, 3)) score += 2;
      if (mode === 'major' && has(rel, 4)) score += 2;
      if (mode === 'pentatonic' && (has(rel, 7) || has(rel, 9))) score += 2;
      if (firstPc != null && t === firstPc) score += 1;
      if (t === roomPc) score += 0.5;
      if (!best || score > best.score) {
        best = { tonicPc: t, mode: mode, rel: rel, score: score };
      }
    }

    if (!best) {
      return {
        mode: null,
        action: null,
        tonicPc: null,
        tonic: null,
        pcs: pcs,
        names: names
      };
    }

    return {
      mode: best.mode,
      action: modeToAction(best.mode),
      tonicPc: best.tonicPc,
      tonic: pcToKeyName(best.tonicPc),
      rel: best.rel,
      score: best.score,
      pcs: pcs,
      names: names
    };
  }

  function classify(pitches, roomKey) {
    roomKey = roomKey || 'C';
    var names = pitchNames(pitches);
    var gesture = inferGesture(names, roomKey);
    if (!gesture.mode) {
      return {
        mode: null,
        action: null,
        tonic: roomKey,
        roomKey: roomKey,
        element: elementForKey(roomKey),
        multiplier: 1,
        circleDistance: 0,
        pitches: names,
        pcs: gesture.pcs
      };
    }
    var dist = circleDistance(gesture.tonic, roomKey);
    var mult = roomMultiplier(dist);
    return {
      mode: gesture.mode,
      action: gesture.action,
      tonic: gesture.tonic,
      roomKey: roomKey,
      element: elementForKey(gesture.tonic),
      multiplier: mult,
      circleDistance: dist,
      pitches: names,
      pcs: gesture.pcs
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

  function gradeDefend(matched) {
    var expectedCount = matched.expectedCount;
    var hitCount = matched.hitCount;
    var extras = matched.extras.length;
    if (expectedCount <= 0) {
      return { grade: 'fail', accuracy: 0 };
    }
    var accuracy = hitCount / expectedCount;
    if (extras >= 2) accuracy = Math.max(0, accuracy - 0.25);
    if (hitCount === expectedCount && extras < 2) {
      return { grade: 'perfect', accuracy: accuracy };
    }
    if (hitCount > 0) {
      return { grade: 'partial', accuracy: accuracy };
    }
    return { grade: 'fail', accuracy: accuracy };
  }

  function partialPlayerDamage(matched) {
    var expectedCount = matched.expectedCount || 0;
    var hitCount = matched.hitCount || 0;
    if (expectedCount <= 0) return MISS_DAMAGE;
    var missedRatio = (expectedCount - hitCount) / expectedCount;
    var dmg = Math.round(MISS_DAMAGE * missedRatio);
    return Math.max(1, dmg);
  }

  /**
   * Defend = copiar la cinta. Perfect / Partial / Fail.
   * No resuelve ataque/buff/cura. Cero daño al jefe.
   */
  function resolveDefend(played, expected, roomKey, opts) {
    opts = opts || {};
    var matched = matchNotes(played, expected, opts.hitWindowBeats);
    var graded = gradeDefend(matched);
    var grade = graded.grade;
    var accuracy = graded.accuracy;
    var playerDamage = 0;
    var kind = 'defend-fail';

    if (grade === 'perfect') {
      playerDamage = 0;
      kind = 'defend-perfect';
    } else if (grade === 'partial') {
      playerDamage = partialPlayerDamage(matched);
      kind = 'defend-partial';
    } else {
      playerDamage = MISS_DAMAGE;
      kind = 'defend-fail';
    }

    return {
      ok: grade !== 'fail',
      kind: kind,
      grade: grade,
      accuracy: accuracy,
      spell: null,
      hits: matched.hitCount,
      expected: matched.expectedCount,
      extras: matched.extras.length,
      missed: matched.missed.length,
      bossDamage: 0,
      heal: 0,
      buff: null,
      playerDamage: playerDamage
    };
  }

  function gestureStrength(spell) {
    var n = (spell && spell.pcs) ? spell.pcs.length : 0;
    if (n >= 3) return 1;
    if (n >= MIN_GESTURE_PCS) return 0.5;
    return 0;
  }

  /**
   * Onset de una nota de Defend contra su blanco.
   * perfect: |error| ≤ ventana cerrada (por defecto 0.15 beats).
   * partial: dentro del hit de combate (por defecto ±0.45) pero no perfect.
   * fail: fuera del hit. Solo presentación; resolveDefend no la usa.
   */
  function judgeNoteSync(errorBeats, hitWindow, perfectWindow) {
    var err = Math.abs(Number(errorBeats));
    if (!isFinite(err)) return 'fail';
    var hit = (typeof hitWindow === 'number') ? hitWindow : HIT_WINDOW_BEATS;
    var perfect = (typeof perfectWindow === 'number') ? perfectWindow : PERFECT_WINDOW_BEATS;
    if (perfect > hit) perfect = hit;
    if (err <= perfect + 1e-9) return 'perfect';
    if (err <= hit + 1e-9) return 'partial';
    return 'fail';
  }

  /**
   * Hole = improvisación libre (en la UI: Ataque). Mayor→ataque, menor→buff, pent→cura.
   * Tocar no daña al jugador. Silencio no se pune.
   */
  function resolveHole(played, roomKey, opts) {
    opts = opts || {};
    var n = (played || []).length;
    if (n === 0) {
      return {
        ok: true,
        kind: 'hole-idle',
        grade: null,
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

    var spell = classify(played, roomKey || 'C');
    if (!spell.mode) {
      return {
        ok: true,
        kind: 'hole-idle',
        grade: null,
        accuracy: 0,
        spell: spell,
        hits: 0,
        expected: 0,
        extras: n,
        missed: 0,
        bossDamage: 0,
        heal: 0,
        buff: null,
        playerDamage: 0
      };
    }

    var strength = gestureStrength(spell);
    var roomMult = spell.multiplier;
    var buffMult = buffMultiplier(opts.buffs);
    var bossDamage = 0;
    var heal = 0;
    var buff = null;

    if (spell.action === 'attack') {
      bossDamage = Math.round(BASE_ATTACK * roomMult * buffMult * strength);
    } else if (spell.action === 'heal') {
      heal = Math.round(BASE_HEAL * roomMult * strength);
    } else if (spell.action === 'buff' && roomMult > 0) {
      buff = { id: 'atk', label: 'ATQ+', amount: 0.5, remaining: 2 };
    }

    return {
      ok: true,
      kind: 'hole-spell',
      grade: null,
      accuracy: 1,
      spell: spell,
      hits: n,
      expected: 0,
      extras: n,
      missed: 0,
      bossDamage: bossDamage,
      heal: heal,
      buff: buff,
      playerDamage: 0,
      strength: strength
    };
  }

  function resolveSetup() {
    return {
      ok: true,
      kind: 'setup',
      grade: null,
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
    inferGesture: inferGesture,
    matchNotes: matchNotes,
    judgeNoteSync: judgeNoteSync,
    resolveDefend: resolveDefend,
    resolveHole: resolveHole,
    resolveSetup: resolveSetup,
    circleDistance: circleDistance,
    roomMultiplier: roomMultiplier,
    elementForKey: elementForKey,
    modeToAction: modeToAction,
    keyToPc: keyToPc,
    pcToKeyName: pcToKeyName,
    ELEMENTS: KEY_ELEMENTS,
    KEY_ELEMENTS: KEY_ELEMENTS,
    MODE_ACTION: MODE_ACTION,
    BASE_ATTACK: BASE_ATTACK,
    BASE_HEAL: BASE_HEAL,
    MISS_DAMAGE: MISS_DAMAGE,
    HIT_WINDOW_BEATS: HIT_WINDOW_BEATS,
    PERFECT_WINDOW_BEATS: PERFECT_WINDOW_BEATS,
    MIN_ACCURACY: MIN_ACCURACY,
    FULL_ACCURACY: FULL_ACCURACY,
    MIN_GESTURE_PCS: MIN_GESTURE_PCS,
    HOLE_WINDOW_BARS: HOLE_WINDOW_BARS,
    SALA_MULT: SALA_MULT
  };
});
