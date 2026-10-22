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
    // Compás vacío: silencio escrito. Tocar ahí es fallo; no tocar es perfecto.
    if (expectedCount <= 0) {
      if (extras === 0) return { grade: 'perfect', accuracy: 1 };
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

  // v0.1.11: ritmo del Ataque. Rejilla de semicorcheas alineada con los pulsos
  // del juego (centro del pulso = beatInBar k+0.5). Ventanas por nivel:
  // negra (k+0.5) ±0.20 · corchea (k) ±0.12 · semicorchea (k±0.25) ±0.06 beat.
  var GRID_TOL = { 1: 0.2, 0.5: 0.12, 0.25: 0.06 };
  var DURS = [
    { beats: 4, name: 'redonda' }, { beats: 3, name: 'blanca con puntillo', dot: true, base: 2 },
    { beats: 2, name: 'blanca' }, { beats: 1.5, name: 'negra con puntillo', dot: true, base: 1 },
    { beats: 1, name: 'negra' }, { beats: 0.75, name: 'corchea con puntillo', dot: true, base: 0.5 },
    { beats: 0.5, name: 'corchea' }, { beats: 0.25, name: 'semicorchea' }
  ];
  var FIG_BY_BEATS = {};
  DURS.forEach(function (d) { FIG_BY_BEATS[d.beats] = d; });

  // Parte una nota sostenida en figuras ligadas (posición musical: 0 = pulso 1).
  // Corta en la barra de compás y en la mitad del compás (4/4: pulso 3) si la
  // nota no empieza ahí; una nota a contratiempo primero llega al siguiente pulso.
  function splitTied(pos, beats, bpb) {
    bpb = bpb || 4;
    var total = Math.max(0.25, Math.round(beats / 0.25) * 0.25);
    var p = Math.round(pos / 0.25) * 0.25;
    var segs = [];
    var guard = 0;
    while (total > 1e-6 && guard++ < 64) {
      var inBar = ((p % bpb) + bpb) % bpb;
      var limit = Math.min(total, bpb - inBar);
      var half = bpb / 2;
      if (bpb % 2 === 0 && inBar < half && inBar + limit > half && inBar !== 0) limit = half - inBar;
      var toBeat = Math.ceil(inBar - 1e-9) - inBar;
      if (toBeat > 1e-6 && limit > toBeat) limit = toBeat;
      var fig = null;
      for (var i = 0; i < DURS.length; i++) {
        if (DURS[i].beats <= limit + 1e-9) {
          // dentro del pulso no se usan puntillos que crucen pulsos raros
          if (DURS[i].dot && DURS[i].beats > 1 && inBar % 1 !== 0) continue;
          fig = DURS[i]; break;
        }
      }
      if (!fig) fig = DURS[DURS.length - 1];
      segs.push({ pos: p, beats: fig.beats, name: fig.name, dot: !!fig.dot, base: fig.base || fig.beats, tied: false });
      p += fig.beats;
      total -= fig.beats;
    }
    for (var j = 0; j < segs.length - 1; j++) segs[j].tied = true;
    return segs;
  }

  function snapOnset(beatInBar) {
    if (typeof beatInBar !== 'number' || !isFinite(beatInBar)) return { ok: true, grid: null, level: null, error: 0 };
    // Primero el pulso (negra), luego la corchea, luego la semicorchea.
    var levels = [[1, 0.5], [0.5, 0], [0.25, 0.25]];
    var nearest = null;
    for (var i = 0; i < levels.length; i++) {
      var step = levels[i][0] === 0.25 ? 0.5 : 1;
      var g = Math.round((beatInBar - levels[i][1]) / step) * step + levels[i][1];
      var err = beatInBar - g;
      if (!nearest || Math.abs(err) < Math.abs(nearest.error)) nearest = { ok: false, grid: g, level: levels[i][0], error: err };
      if (Math.abs(err) <= GRID_TOL[levels[i][0]] + 1e-9) return { ok: true, grid: g, level: levels[i][0], error: err };
    }
    return nearest;
  }

  // Duración medida (beats) → figura más cercana en escala logarítmica.
  function quantizeDuration(beats) {
    if (typeof beats !== 'number' || !(beats > 0)) return null;
    var best = DURS[0], bd = Infinity;
    for (var i = 0; i < DURS.length; i++) {
      var d = Math.abs(Math.log(beats / DURS[i].beats));
      if (d < bd) { bd = d; best = DURS[i]; }
    }
    return { beats: best.beats, name: best.name, dot: !!best.dot, base: best.base || best.beats };
  }

  // v0.1.11: Ataque por escala de sala explícita (chart.roomScale). Tónica = 1ª nota.
  // Precedencia: tríada menor de la tónica > pentatónica > tríada mayor > ataque base.
  var TRIAD_MULT = 2;
  var MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  var PENTA = [0, 2, 4, 7, 9];

  function scaleFor(room) {
    if (Array.isArray(room) && room.length) return room.slice();
    var t = keyToPc(room || 'C');
    return MAJOR_SCALE.map(function (iv) { return pcToKeyName((t + iv) % 12); });
  }

  function evaluateHole(pitches, room) {
    var scale = scaleFor(room);
    var scalePcs = scale.map(function (k) { return keyToPc(k); });
    var tonic = scalePcs[0];
    var set = {};
    (pitches || []).forEach(function (p) {
      var pc = Translator.pitchClass(typeof p === 'string' ? p : p && p.pitch);
      if (pc != null) set[pc] = true;
    });
    var pcs = Object.keys(set).map(Number);
    var rel = pcs.map(function (pc) { return ((pc - tonic) % 12 + 12) % 12; });
    var has = function (iv) { return rel.indexOf(iv) >= 0; };
    var inScale = pcs.filter(function (pc) { return scalePcs.indexOf(pc) >= 0; });
    var mode = null, action = null;
    if (has(0) && has(3) && has(7)) { mode = 'minor'; action = 'buff'; }
    else if (inScale.length >= 4 && inScale.every(function (pc) { return PENTA.indexOf(((pc - tonic) % 12 + 12) % 12) >= 0; })
      && inScale.some(function (pc) { var r = ((pc - tonic) % 12 + 12) % 12; return r === 2 || r === 9; })) { mode = 'pentatonic'; action = 'heal'; }
    else if (has(0) && has(4) && has(7)) { mode = 'major'; action = 'attack'; }
    else if (inScale.length >= 1) { mode = 'base'; action = 'attack'; }
    return {
      mode: mode, action: action, tonic: scale[0], roomScale: scale,
      inScale: inScale.map(pcToKeyName), outOfScale: pcs.filter(function (pc) { return scalePcs.indexOf(pc) < 0; }).map(pcToKeyName),
      element: elementForKey(scale[0]), pitches: (pitches || []).map(function (p) { return typeof p === 'string' ? p : p.pitch; })
    };
  }

  /**
   * Hole (Ataque). room = roomScale (array) o roomKey (→ escala mayor).
   * base: ≥1 nota de la escala → 2×mejora. Tríada mayor de la tónica → 2×2×mejora.
   * Tríada menor de la tónica → mejora ATQ+ (sin daño). Pentatónica (≥4 pcs de la penta,
   * con 2ª o 6ª) → cura 3. Notas fuera de escala no cuentan. Tocar no daña al jugador.
   */
  function resolveHole(played, room, opts) {
    opts = opts || {};
    var n = (played || []).length;
    var rhythm = (played || []).map(function (p) {
      var bib = (p && typeof p.beatInBar === 'number') ? p.beatInBar : null;
      return { pitch: typeof p === 'string' ? p : p.pitch, snap: snapOnset(bib) };
    });
    var onTime = (played || []).filter(function (p, i) { return opts.rhythm === false || rhythm[i].snap.ok; });
    var spell = onTime.length ? evaluateHole(onTime, room) : null;
    if (!spell || !spell.action) {
      return { ok: true, kind: 'hole-idle', grade: null, accuracy: n ? 0 : 1, spell: spell, hits: 0, expected: 0,
        extras: n, missed: 0, bossDamage: 0, heal: 0, buff: null, playerDamage: 0, rhythm: rhythm, offGrid: n - onTime.length };
    }
    var buffMult = buffMultiplier(opts.buffs);
    var bossDamage = 0, heal = 0, buff = null;
    if (spell.mode === 'major') bossDamage = Math.round(BASE_ATTACK * TRIAD_MULT * buffMult);
    else if (spell.mode === 'base') bossDamage = Math.round(BASE_ATTACK * buffMult);
    else if (spell.mode === 'pentatonic') heal = BASE_HEAL;
    else if (spell.mode === 'minor') buff = { id: 'atk', label: 'ATQ+', amount: 0.5, remaining: 2 };
    return { ok: true, kind: 'hole-spell', grade: null, accuracy: 1, spell: spell, hits: n, expected: 0,
      extras: n, missed: 0, bossDamage: bossDamage, heal: heal, buff: buff, playerDamage: 0, strength: 1, rhythm: rhythm, offGrid: n - onTime.length };
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
    evaluateHole: evaluateHole,
    snapOnset: snapOnset,
    quantizeDuration: quantizeDuration,
    splitTied: splitTied,
    DURS: DURS,
    GRID_TOL: GRID_TOL,
    scaleFor: scaleFor,
    TRIAD_MULT: TRIAD_MULT,
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
