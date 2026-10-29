'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Tape = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BEAT_CENTER = 0.5;
  var KIND_INK = { setup: '#1d4e89', defend: '#1b6b42', hole: '#6d3d96' };
  var KIND_LABEL = { setup: 'ESCUCHA', defend: 'DEFIENDE', hole: 'ATAQUE' };
  var PARCHMENT = '#efe6d2';
  var INK = '#1c140c';
  var HAND_INK = { R: '#1e4d8c', L: '#c2410c' };
  var CLEF_G = 0.486;
  var LETTER = { C: -2, D: -1, E: 0, F: 1, G: 2, A: 3, B: 4 };
  var STAFF_MIDDLE_STEP = 4;
  var HOLLOW_FROM_BEATS = 2;
  var STEMLESS_FROM_BEATS = 4;
  var REST_UNITS = [4, 2, 1, 0.5];
  var BEAT_EPS = 1e-6;
  var LEDGER_HALF = 0.76;
  var SHEET_GAP_MIN = 2.2;
  var TAPE_GAP = 1.35;
  var GAP_HEAD = 0.45;
  var GAP_CLEAR = 0.35;
  var TREBLE_BOTTOM_STEP = 0;
  var BASS_TOP_STEP = 8;
  var BASS_SHIFT = 12;
  var BRACE_W = 0.95;
  var F_CLEF_W = 2.75;
  var REST_INK = 'rgba(28, 20, 12, 0.62)';
  var HANDS = ['R', 'L'];

  function loadImage(src) {
    if (typeof Image === 'undefined' || !src) return null;
    var img = new Image();
    img.src = src;
    return img;
  }

  function ready(img) {
    return !!(img && img.complete && img.naturalWidth);
  }

  function pitchParts(pitch) {
    var s = String(pitch || '').trim();
    var m = /^([A-Ga-g])([#b])?(-?\d+)$/.exec(s);
    if (!m) return null;
    var letter = m[1].toUpperCase();
    if (LETTER[letter] == null) return null;
    var oct = parseInt(m[3], 10);
    if (!isFinite(oct)) return null;
    return {
      letter: letter,
      acc: m[2] || '',
      oct: oct,
      step: LETTER[letter] + (oct - 4) * 7
    };
  }

  function fingerMark(note) {
    if (!note || typeof note.finger !== 'number' || !isFinite(note.finger)) return null;
    if (note.finger !== Math.round(note.finger)) return null;
    if (note.finger < 1 || note.finger > 5) return null;
    var hand = note.hand === 'L' ? 'L' : 'R';
    return { finger: note.finger, hand: hand, below: hand === 'L' };
  }

  function noteShape(dur) {
    var d = (typeof dur === 'number' && isFinite(dur) && dur > 0) ? dur : 1;
    var dotted = false;
    var base = d;
    if (REST_UNITS.indexOf(d) < 0) {
      for (var k = 0; k < REST_UNITS.length; k++) {
        if (Math.abs(REST_UNITS[k] * 1.5 - d) < BEAT_EPS) { base = REST_UNITS[k]; dotted = true; break; }
      }
    }
    return { hollow: base >= HOLLOW_FROM_BEATS, stem: base < STEMLESS_FROM_BEATS, dot: dotted };
  }

  function splitRest(start, len, bpb) {
    var out = [];
    var pos = start;
    var left = len;
    var guard = 0;
    while (left > BEAT_EPS && guard++ < 64) {
      var picked = 0;
      for (var k = 0; k < REST_UNITS.length; k++) {
        var u = REST_UNITS[k];
        if (u > left + BEAT_EPS) continue;
        if (u >= bpb - BEAT_EPS && pos > BEAT_EPS) continue;
        if (Math.abs(pos / u - Math.round(pos / u)) > BEAT_EPS) continue;
        picked = u;
        break;
      }
      if (!picked) picked = Math.min(left, REST_UNITS[REST_UNITS.length - 1]);
      out.push({ beat: pos, dur: picked >= bpb - BEAT_EPS ? bpb : picked, whole: picked >= bpb - BEAT_EPS });
      pos += picked;
      left -= picked;
    }
    return out;
  }

  function handRests(notes, hand, beatsPerBar) {
    var bpb = (typeof beatsPerBar === 'number' && beatsPerBar > 0) ? beatsPerBar : 4;
    var spans = [];
    var i;
    for (i = 0; i < (notes || []).length; i++) {
      var n = notes[i];
      var h = n.hand === 'L' ? 'L' : 'R';
      if (h !== hand) continue;
      var b = (typeof n.beat === 'number' && isFinite(n.beat)) ? n.beat : 0;
      var d = (typeof n.dur === 'number' && isFinite(n.dur) && n.dur > 0) ? n.dur : 1;
      spans.push([b, Math.min(bpb, b + d)]);
    }
    if (!spans.length) return [{ beat: 0, dur: bpb, whole: true }];
    spans.sort(function (a, c) { return a[0] - c[0]; });
    var rests = [];
    var cursor = 0;
    for (i = 0; i < spans.length; i++) {
      if (spans[i][0] > cursor + BEAT_EPS) rests = rests.concat(splitRest(cursor, spans[i][0] - cursor, bpb));
      if (spans[i][1] > cursor) cursor = spans[i][1];
    }
    if (bpb > cursor + BEAT_EPS) rests = rests.concat(splitRest(cursor, bpb - cursor, bpb));
    return rests;
  }

  function staffStep(pitch) {
    var p = pitchParts(pitch);
    return p ? p.step : null;
  }

  function placeNote(pitch, hand) {
    var parts = pitchParts(pitch);
    if (!parts) return null;
    var bass = hand === 'L' || (hand !== 'R' && parts.step <= -3);
    if (bass) {
      return { parts: parts, step: parts.step + BASS_SHIFT, staff: 'bass', low: -2, high: 10, hand: 'L' };
    }
    return { parts: parts, step: parts.step, staff: 'treble', low: -2, high: 10, hand: 'R' };
  }

  function chordInfo(notes, note) {
    var lo = null;
    var hi = null;
    var count = 0;
    for (var i = 0; i < (notes || []).length; i++) {
      var n = notes[i];
      if (!n || n.hand !== note.hand || Math.abs((n.beat || 0) - (note.beat || 0)) > BEAT_EPS) continue;
      var placed = placeNote(n.pitch, n.hand);
      if (!placed) continue;
      count++;
      if (lo == null || placed.step < lo) lo = placed.step;
      if (hi == null || placed.step > hi) hi = placed.step;
    }
    if (count < 2) return null;
    return { lo: lo, hi: hi, up: (lo + hi) / 2 < STAFF_MIDDLE_STEP };
  }

  function staffGapFor(bars, minGap) {
    var gap = minGap;
    var deepR = 0;
    var highL = 0;
    for (var i = 0; i < (bars || []).length; i++) {
      var notes = (bars[i] && bars[i].notes) || [];
      for (var j = 0; j < notes.length; j++) {
        var placed = placeNote(notes[j].pitch, notes[j].hand);
        if (!placed) continue;
        if (placed.staff === 'treble') deepR = Math.max(deepR, (TREBLE_BOTTOM_STEP - placed.step) / 2);
        else highL = Math.max(highL, (placed.step - BASS_TOP_STEP) / 2);
      }
    }
    var need = (deepR > 0 ? deepR + GAP_HEAD : 0) + (highL > 0 ? highL + GAP_HEAD : 0) + GAP_CLEAR;
    return Math.max(gap, need);
  }

  function attackBeatMarks(barStart, beatsPerBar, playBeat) {
    var n = (typeof beatsPerBar === 'number' && beatsPerBar > 0) ? Math.round(beatsPerBar) : 4;
    var start = (typeof barStart === 'number' && isFinite(barStart)) ? barStart : 0;
    var play = (typeof playBeat === 'number' && isFinite(playBeat)) ? playBeat : 0;
    var marks = [];
    var i;
    for (i = 0; i < n; i++) {
      var onset = start + i;
      marks.push({
        beat: onset + BEAT_CENTER,
        label: String(i + 1),
        current: play >= onset && play < onset + 1
      });
    }
    return marks;
  }

  function chartNoteBeat(barStart, noteBeat) {
    var start = (typeof barStart === 'number' && isFinite(barStart)) ? barStart : 0;
    var nb = (typeof noteBeat === 'number' && isFinite(noteBeat)) ? noteBeat : 0;
    return start + nb + BEAT_CENTER;
  }

  function fuseVisual(sync, ageBeats) {
    var age = (typeof ageBeats === 'number' && ageBeats > 0) ? ageBeats : 0;
    if (sync !== 'perfect' && sync !== 'partial') {
      return {
        sync: 'fail',
        lerp: 0,
        glow: age < 0.18 ? 0.25 : 0,
        sparkle: 0,
        scale: 1,
        showPlayer: true,
        fused: false,
        miss: true
      };
    }
    var dur = sync === 'perfect' ? 0.26 : 0.42;
    var linger = sync === 'perfect' ? 0.2 : 0.1;
    var t = age >= dur ? 1 : age / dur;
    var e = 1 - Math.pow(1 - t, 3);
    var strength = sync === 'perfect' ? 1 : 0.48;
    var glowT = age / (dur + linger);
    return {
      sync: sync,
      lerp: e,
      glow: glowT >= 1 ? 0 : (1 - glowT) * strength,
      sparkle: t < 0.92 ? strength : 0,
      scale: 1 + (sync === 'perfect' ? 0.42 : 0.16) * Math.sin(Math.PI * Math.min(1, t)),
      showPlayer: t < 0.94,
      fused: t >= 1,
      miss: false
    };
  }

  function create(canvas, opts) {
    opts = opts || {};
    var version = opts.version || '0.1.9';
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var clefImg = loadImage(opts.clef || ('assets/ui/treble-clef.png?v=' + version));
    var lastState = null;
    var lastSheet = null;
    var sheetGeom = null;

    function resize() {
      if (!canvas || !ctx) return;
      var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      var cssW = canvas.clientWidth || 360;
      var cssH = canvas.clientHeight || 96;
      if (cssW < 2 || cssH < 2) return;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function yFor(step, bottomLine, lineGap) {
      return bottomLine - step * (lineGap / 2);
    }

    function drawLedgers(c, x, step, bottomLine, lineGap, low, high, yMin, yMax) {
      var ls;
      var y;
      if (low == null) low = -2;
      if (high == null) high = 10;
      function allow(at) {
        if (yMin != null && at <= yMin) return false;
        if (yMax != null && at >= yMax) return false;
        return true;
      }
      if (step <= low) {
        for (ls = low; ls >= step; ls -= 2) {
          y = yFor(ls, bottomLine, lineGap);
          if (allow(y)) drawLedger(c, x, y, lineGap);
        }
      }
      if (step >= high) {
        for (ls = high; ls <= step; ls += 2) {
          y = yFor(ls, bottomLine, lineGap);
          if (allow(y)) drawLedger(c, x, y, lineGap);
        }
      }
    }

    function drawLedger(c, x, y, lineGap) {
      var hw = lineGap * LEDGER_HALF;
      c.beginPath();
      c.moveTo(x - hw, y);
      c.lineTo(x + hw, y);
      c.stroke();
    }

    function drawSharp(c, x, y, lineGap, color) {
      var h = lineGap * 1.25;
      var w = lineGap * 0.42;
      c.strokeStyle = color || INK;
      c.lineCap = 'round';
      c.lineWidth = Math.max(1, lineGap * 0.09);
      c.beginPath();
      c.moveTo(x - w * 0.32, y - h * 0.46);
      c.lineTo(x - w * 0.32, y + h * 0.46);
      c.moveTo(x + w * 0.32, y - h * 0.42);
      c.lineTo(x + w * 0.32, y + h * 0.5);
      c.stroke();
      c.lineWidth = Math.max(1.3, lineGap * 0.15);
      c.beginPath();
      c.moveTo(x - w * 0.72, y - h * 0.08);
      c.lineTo(x + w * 0.72, y - h * 0.26);
      c.moveTo(x - w * 0.72, y + h * 0.26);
      c.lineTo(x + w * 0.72, y + h * 0.08);
      c.stroke();
    }

    function drawFlat(c, x, y, lineGap, color) {
      var h = lineGap * 1.35;
      c.strokeStyle = color || INK;
      c.fillStyle = color || INK;
      c.lineWidth = Math.max(1.1, lineGap * 0.11);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, y + h * 0.42);
      c.lineTo(x, y - h * 0.55);
      c.stroke();
      c.beginPath();
      c.moveTo(x, y + h * 0.05);
      c.bezierCurveTo(x + lineGap * 0.55, y - lineGap * 0.05, x + lineGap * 0.55, y + lineGap * 0.55, x, y + h * 0.42);
      c.fill();
    }

    function fingerY(y, step, below, lineGap, stemUp, hasStem) {
      var up = stemUp != null ? stemUp : step < STAFF_MIDDLE_STEP;
      var stemH = hasStem === false ? 0 : lineGap * 3.15;
      var gap = Math.max(8, lineGap * 0.95);
      return below ? ((up ? y : y + stemH) + gap) : ((up ? y - stemH : y) - gap);
    }

    function chordFingerY(notes, note, chord, below, bottomLine, bassBottomLine, lineGap, hasStem) {
      var placed = placeNote(note.pitch, note.hand);
      var edge = below ? chord.lo : chord.hi;
      var sb = placed.staff === 'bass' ? bassBottomLine : bottomLine;
      var base = fingerY(yFor(edge, sb, lineGap), edge, below, lineGap, chord.up, hasStem);
      var rank = 0;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        if (n === note || !fingerMark(n) || n.hand !== note.hand || Math.abs((n.beat || 0) - (note.beat || 0)) > BEAT_EPS) continue;
        var p2 = placeNote(n.pitch, n.hand);
        if (!p2) continue;
        if (below ? p2.step > placed.step : p2.step < placed.step) rank++;
      }
      var size = Math.max(8, Math.round(lineGap * 0.72)) * 1.15;
      return below ? base + rank * size : base - rank * size;
    }

    function drawFingerNum(c, x, y, step, mark, lineGap, color, canvasH, fixedY) {
      if (!mark) return;
      var num = mark.finger;
      var below = !!mark.below;
      var fy = fixedY != null ? fixedY : fingerY(y, step, below, lineGap);
      if (fy < 7) fy = 7;
      if (canvasH && fy > canvasH - 7) fy = canvasH - 7;
      var size = Math.max(8, Math.round(lineGap * 0.72));
      c.save();
      c.font = '700 ' + size + 'px Georgia, serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.miterLimit = 2;
      c.lineWidth = Math.max(2, lineGap * 0.22);
      c.strokeStyle = 'rgba(239, 230, 210, 0.95)';
      c.strokeText(String(num), x, fy);
      c.fillStyle = color || (below ? HAND_INK.L : HAND_INK.R);
      c.fillText(String(num), x, fy);
      c.restore();
    }

    function drawNote(c, x, step, bottomLine, lineGap, style) {
      style = style || {};
      var color = style.color || INK;
      var alpha = style.alpha == null ? 1 : style.alpha;
      var scale = style.scale || 1;
      var hollow = !!style.hollow;
      var stemDown = !!style.stemDown;
      var y = yFor(step, bottomLine, lineGap);
      var rx = Math.max(4, lineGap * 0.52) * scale;
      var ry = Math.max(2.8, lineGap * 0.38) * scale;
      c.save();
      c.globalAlpha = alpha;
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, lineGap * 0.09);
      c.lineCap = 'butt';
      drawLedgers(c, x, step, bottomLine, lineGap, style.low, style.high, style.ledgerMin, style.ledgerMax);
      var up = stemDown ? false : (style.stemUp != null ? !!style.stemUp : step < STAFF_MIDDLE_STEP);
      var stemH = lineGap * 3.15;
      var showStem = style.stem !== false;
      var y2 = up ? y - stemH : y + stemH;
      if (up && style.stemCeil != null && y2 < style.stemCeil) y2 = style.stemCeil;
      if (!up && style.stemFloor != null && y2 > style.stemFloor) y2 = style.stemFloor;
      if (up && y2 > y) y2 = y;
      if (!up && y2 < y) y2 = y;
      c.strokeStyle = color;
      c.lineWidth = Math.max(1, lineGap * 0.1);
      if (showStem) {
        c.beginPath();
        if (up) {
          c.moveTo(x + rx * 0.82, y + ry * 0.1);
          c.lineTo(x + rx * 0.82, y2);
        } else {
          c.moveTo(x - rx * 0.82, y - ry * 0.1);
          c.lineTo(x - rx * 0.82, y2);
        }
        c.stroke();
      }
      if (style.dot) {
        c.fillStyle = color;
        c.beginPath();
        c.arc(x + rx * 1.75, y - (step % 2 === 0 ? lineGap * 0.28 : 0), Math.max(1.5, lineGap * 0.13), 0, Math.PI * 2);
        c.fill();
      }
      c.save();
      c.translate(x, y);
      c.rotate(-0.42);
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      if (hollow) {
        c.fillStyle = 'rgba(255, 250, 240, 0.94)';
        c.fill();
        c.strokeStyle = color;
        c.lineWidth = Math.max(1.5, lineGap * 0.14);
        c.stroke();
      } else {
        c.fillStyle = color;
        c.fill();
      }
      c.restore();
      c.restore();
    }

    function drawRhythm(c, improv, xAt, bottomLine, lineGap, clefRight, w, place) {
      place = place || function (parts) { return { step: parts.step, low: -2, high: 10, color: null }; };
      var heads = [];
      for (var i = 0; i < improv.length; i++) {
        var n = improv[i];
        var parts = pitchParts(n.pitch);
        if (!parts) continue;
        var loc = place(parts, n);
        var segs = (n.segs && n.segs.length) ? n.segs : [{ pos: n.gridBeat - BEAT_CENTER, beats: 1, base: 1, dot: false, tied: false }];
        for (var s2 = 0; s2 < segs.length; s2++) {
          var g = segs[s2];
          heads.push({ x: xAt(g.pos + BEAT_CENTER), y: yFor(loc.step, bottomLine, lineGap), step: loc.step, low: loc.low, high: loc.high, ink: loc.color,
            acc: s2 === 0 ? parts.acc : '',
            base: g.base, dot: g.dot, tied: g.tied, pos: g.pos, off: n.onGrid === false, held: n.held && s2 === segs.length - 1,
            next: null });
          if (s2 > 0) heads[heads.length - 2].next = heads[heads.length - 1];
        }
      }
      var rx = Math.max(4, lineGap * 0.52), stemH = lineGap * 3.15;
      var groups = {};
      heads.forEach(function (h) {
        if (h.x < clefRight - 2 || h.x > w + 12) { h.skip = true; return; }
        var col = h.off ? 'rgba(90,80,70,0.55)' : (h.ink || (h.held ? '#1a4f8b' : '#5b2d86'));
        h.col = col;
        if (h.acc === '#') drawSharp(c, h.x - lineGap * 0.85, h.y, lineGap, col);
        else if (h.acc === 'b') drawFlat(c, h.x - lineGap * 0.7, h.y, lineGap, col);
        var hollow = h.base >= 2;
        c.save();
        c.globalAlpha = 1;
        drawLedgers(c, h.x, h.step, bottomLine, lineGap, h.low, h.high);
        c.translate(h.x, h.y); c.rotate(-0.42); c.beginPath();
        c.ellipse(0, 0, rx, Math.max(2.8, lineGap * 0.38), 0, 0, Math.PI * 2);
        if (hollow) { c.fillStyle = 'rgba(255,250,240,0.94)'; c.fill(); c.strokeStyle = col; c.lineWidth = Math.max(1.5, lineGap * 0.14); c.stroke(); }
        else { c.fillStyle = col; c.fill(); }
        c.restore();
        h.sx = h.x + rx * 0.82; h.sy = h.y - stemH;
        if (h.base < 4) {
          c.strokeStyle = col; c.lineWidth = Math.max(1, lineGap * 0.1);
          c.beginPath(); c.moveTo(h.sx, h.y); c.lineTo(h.sx, h.sy); c.stroke();
        }
        if (h.dot) { c.fillStyle = col; c.beginPath(); c.arc(h.x + rx * 1.7, h.y - (h.step % 2 === 0 ? lineGap * 0.3 : 0), Math.max(1.6, lineGap * 0.13), 0, Math.PI * 2); c.fill(); }
        if (h.off) drawMiss(c, h.x, h.y, lineGap);
        if (h.base <= 0.5 && !h.off) {
          var key = Math.floor(h.pos + 1e-6);
          (groups[key] = groups[key] || []).push(h);
        }
      });
      heads.forEach(function (h) {
        if (!h.tied || !h.next || h.skip) return;
        var x2 = Math.min(h.next.x, w + 12);
        c.strokeStyle = h.col; c.lineWidth = Math.max(1.2, lineGap * 0.12);
        c.beginPath(); c.moveTo(h.x + rx * 0.6, h.y + lineGap * 0.55);
        c.quadraticCurveTo((h.x + x2) / 2, h.y + lineGap * 1.35, x2 - rx * 0.6, h.y + lineGap * 0.55); c.stroke();
      });
      var bw = Math.max(2.4, lineGap * 0.38), gap = bw * 1.6;
      Object.keys(groups).forEach(function (k) {
        var gr = groups[k].sort(function (a, b) { return a.pos - b.pos; });
        c.fillStyle = gr[0].col;
        if (gr.length === 1) {
          var h = gr[0], flags = h.base <= 0.25 ? 2 : 1;
          c.strokeStyle = h.col; c.lineWidth = Math.max(1.4, lineGap * 0.16);
          for (var f = 0; f < flags; f++) { c.beginPath(); c.moveTo(h.sx, h.sy + f * gap); c.quadraticCurveTo(h.sx + lineGap, h.sy + f * gap + lineGap * 0.9, h.sx + lineGap * 0.7, h.sy + f * gap + lineGap * 1.9); c.stroke(); }
          return;
        }
        var top = Math.min.apply(null, gr.map(function (h) { return h.sy; }));
        c.strokeStyle = gr[0].col; c.lineWidth = Math.max(1, lineGap * 0.1);
        gr.forEach(function (h) { c.beginPath(); c.moveTo(h.sx, h.sy); c.lineTo(h.sx, top); c.stroke(); h.sy = top; });
        var x0 = gr[0].sx, x1 = gr[gr.length - 1].sx;
        c.fillRect(x0, top, x1 - x0, bw);
        for (var i2 = 0; i2 < gr.length; i2++) {
          if (gr[i2].base > 0.25) continue;
          var j = i2;
          while (j + 1 < gr.length && gr[j + 1].base <= 0.25) j++;
          if (j > i2) c.fillRect(gr[i2].sx, top + gap, gr[j].sx - gr[i2].sx, bw);
          else {
            var stub = lineGap * 0.9;
            if (i2 === gr.length - 1) c.fillRect(gr[i2].sx - stub, top + gap, stub, bw);
            else c.fillRect(gr[i2].sx, top + gap, stub, bw);
          }
          i2 = j;
        }
      });
    }

    function drawZoneMark(c, x, y, kind, s) {
      c.save();
      c.translate(x, y);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (kind === 'hole') {
        c.fillStyle = '#8a5a12';
        c.beginPath();
        c.moveTo(s * 0.12, -s * 0.62);
        c.lineTo(-s * 0.32, s * 0.02);
        c.lineTo(-s * 0.02, s * 0.02);
        c.lineTo(-s * 0.18, s * 0.62);
        c.lineTo(s * 0.38, -s * 0.06);
        c.lineTo(s * 0.04, -s * 0.06);
        c.closePath();
        c.fill();
      } else if (kind === 'defend') {
        c.fillStyle = 'rgba(150, 214, 170, 0.95)';
        c.strokeStyle = '#1b6b42';
        c.lineWidth = Math.max(1.3, s * 0.1);
        c.beginPath();
        c.moveTo(0, -s * 0.58);
        c.lineTo(s * 0.5, -s * 0.26);
        c.lineTo(s * 0.38, s * 0.36);
        c.quadraticCurveTo(0, s * 0.68, -s * 0.38, s * 0.36);
        c.lineTo(-s * 0.5, -s * 0.26);
        c.closePath();
        c.fill();
        c.stroke();
      } else {
        c.strokeStyle = '#1d4e89';
        c.lineWidth = Math.max(1.5, s * 0.12);
        c.beginPath();
        c.arc(0, s * 0.1, s * 0.22, Math.PI * 1.15, Math.PI * 1.85, true);
        c.stroke();
        c.beginPath();
        c.arc(0, s * 0.1, s * 0.46, Math.PI * 1.2, Math.PI * 1.8, true);
        c.stroke();
        c.beginPath();
        c.arc(0, s * 0.1, s * 0.7, Math.PI * 1.25, Math.PI * 1.75, true);
        c.stroke();
      }
      c.restore();
    }

    function drawHalo(c, x, y, lineGap, glow, strong, color) {
      if (glow <= 0.02) return;
      var col = color || (strong ? '#ffe7a0' : '#f0b45a');
      c.save();
      c.globalAlpha = 0.3 + 0.7 * glow;
      c.strokeStyle = col;
      c.lineWidth = strong ? 3.2 : 1.8;
      c.shadowColor = col;
      c.shadowBlur = lineGap * (strong ? 1.55 : 0.7);
      c.beginPath();
      c.arc(x, y, lineGap * (strong ? 1.05 : 0.78) * (0.85 + 0.2 * glow), 0, Math.PI * 2);
      c.stroke();
      if (strong) {
        c.globalAlpha = 0.55 * glow;
        c.fillStyle = '#fff6d0';
        c.beginPath();
        c.arc(x, y, lineGap * 0.28, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    function drawSparkles(c, x, y, lineGap, amount, age) {
      if (amount <= 0.04) return;
      var n = amount > 0.7 ? 8 : 4;
      var i;
      for (i = 0; i < n; i++) {
        var ang = (i / n) * Math.PI * 2 + age * 5.5;
        var rad = lineGap * (0.9 + amount * 1.35) * (0.45 + (age % 0.25) * 2);
        var sx = x + Math.cos(ang) * rad;
        var sy = y + Math.sin(ang) * rad * 0.62;
        c.fillStyle = amount > 0.7
          ? 'rgba(255, 244, 190, ' + (0.95 * amount) + ')'
          : 'rgba(255, 190, 100, ' + (0.75 * amount) + ')';
        c.beginPath();
        c.arc(sx, sy, Math.max(1.2, lineGap * (amount > 0.7 ? 0.14 : 0.09)), 0, Math.PI * 2);
        c.fill();
      }
    }

    function drawBassClef(c, x, bottomLine, lineGap) {
      var fY = yFor(6, bottomLine, lineGap);
      var u = lineGap;
      c.save();
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(x + u * 0.12, fY);
      c.bezierCurveTo(x + u * 0.12, fY - u * 1.3, x + u * 2.05, fY - u * 1.4, x + u * 2.05, fY + u * 0.1);
      c.bezierCurveTo(x + u * 2.05, fY + u * 1.35, x + u * 1.15, fY + u * 2.25, x + u * 0.12, fY + u * 2.8);
      c.bezierCurveTo(x + u * 0.95, fY + u * 2.1, x + u * 1.55, fY + u * 1.25, x + u * 1.55, fY + u * 0.1);
      c.bezierCurveTo(x + u * 1.55, fY - u * 0.95, x + u * 0.75, fY - u * 1.0, x + u * 0.55, fY - u * 0.35);
      c.closePath();
      c.fill();
      c.beginPath();
      c.arc(x + u * 0.42, fY + u * 0.02, u * 0.34, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(x + u * 2.5, fY - u * 0.5, Math.max(1.2, u * 0.15), 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(x + u * 2.5, fY + u * 0.5, Math.max(1.2, u * 0.15), 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    function drawBrace(c, x, top, bottom, width) {
      var mid = (top + bottom) / 2;
      var half = (bottom - top) / 2;
      var w = width;
      c.save();
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(x + w, top);
      c.bezierCurveTo(x + w * 0.05, top + half * 0.08, x + w * 0.75, mid - half * 0.25, x, mid);
      c.bezierCurveTo(x + w * 0.75, mid + half * 0.25, x + w * 0.05, bottom - half * 0.08, x + w, bottom);
      c.bezierCurveTo(x + w * 0.45, bottom - half * 0.12, x + w * 1.05, mid + half * 0.3, x + w * 0.22, mid);
      c.bezierCurveTo(x + w * 1.05, mid - half * 0.3, x + w * 0.45, top + half * 0.12, x + w, top);
      c.closePath();
      c.fill();
      c.restore();
    }

    function drawTie(c, x1, x2, y, below, lineGap, color) {
      var rx = Math.max(4, lineGap * 0.52);
      var a = x1 + rx * 0.9;
      var b = x2 - rx * 0.9;
      if (b - a < lineGap * 0.6) {
        a = x1 + rx * 0.4;
        b = x2 - rx * 0.4;
      }
      if (b <= a) return;
      var dir = below ? 1 : -1;
      var y0 = y + dir * lineGap * 0.55;
      var lift = dir * Math.min(lineGap * 1.1, Math.max(lineGap * 0.5, (b - a) * 0.12));
      var thick = dir * Math.max(1.2, lineGap * 0.16);
      c.save();
      c.fillStyle = color || INK;
      c.beginPath();
      c.moveTo(a, y0);
      c.bezierCurveTo(a + (b - a) * 0.25, y0 + lift, b - (b - a) * 0.25, y0 + lift, b, y0);
      c.bezierCurveTo(b - (b - a) * 0.25, y0 + lift + thick, a + (b - a) * 0.25, y0 + lift + thick, a, y0);
      c.closePath();
      c.fill();
      c.restore();
    }

    function drawAccent(c, x, y, below, lineGap, color) {
      var wd = lineGap * 0.55;
      var ht = lineGap * 0.28;
      var cy = y + (below ? 1 : -1) * lineGap * 1.25;
      c.save();
      c.strokeStyle = color || INK;
      c.lineWidth = Math.max(1.3, lineGap * 0.13);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x - wd, cy - ht);
      c.lineTo(x + wd, cy);
      c.lineTo(x - wd, cy + ht);
      c.stroke();
      c.restore();
    }

    function drawRest(c, x, staffBottom, lineGap, rest, color) {
      var col = color || REST_INK;
      var midY = yFor(STAFF_MIDDLE_STEP, staffBottom, lineGap);
      var bw = lineGap * 0.95;
      var bh = lineGap * 0.48;
      c.save();
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (rest.whole || rest.dur >= STEMLESS_FROM_BEATS) {
        c.fillRect(x - bw / 2, midY - lineGap, bw, bh);
      } else if (rest.dur >= HOLLOW_FROM_BEATS) {
        c.fillRect(x - bw / 2, midY - bh, bw, bh);
      } else if (rest.dur >= 1) {
        var s = lineGap;
        c.lineWidth = Math.max(1.4, s * 0.2);
        c.beginPath();
        c.moveTo(x - s * 0.2, midY - s * 1.45);
        c.lineTo(x + s * 0.3, midY - s * 0.75);
        c.lineTo(x - s * 0.22, midY - s * 0.1);
        c.lineTo(x + s * 0.3, midY + s * 0.55);
        c.quadraticCurveTo(x - s * 0.45, midY + s * 0.2, x - s * 0.05, midY + s * 1.15);
        c.stroke();
      } else {
        var e = lineGap;
        c.lineWidth = Math.max(1.2, e * 0.14);
        c.beginPath();
        c.arc(x - e * 0.2, midY - e * 0.45, Math.max(1.4, e * 0.18), 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(x - e * 0.2, midY - e * 0.3);
        c.quadraticCurveTo(x + e * 0.15, midY - e * 0.25, x + e * 0.35, midY - e * 0.6);
        c.lineTo(x - e * 0.05, midY + e * 0.75);
        c.stroke();
      }
      c.restore();
    }

    function drawBarRests(c, bar, bpb, xAt, barStart, trebleBottom, bassBottomLine, lineGap, xMin, xMax) {
      var notes = bar.notes || [];
      for (var hi = 0; hi < HANDS.length; hi++) {
        var hand = HANDS[hi];
        var rests = handRests(notes, hand, bpb);
        var staffBottom = hand === 'L' ? bassBottomLine : trebleBottom;
        for (var ri = 0; ri < rests.length; ri++) {
          var r = rests[ri];
          var rx = r.whole ? (xAt(barStart) + xAt(barStart + bpb)) / 2 : xAt(chartNoteBeat(barStart, r.beat));
          if (rx < xMin || rx > xMax) continue;
          drawRest(c, rx, staffBottom, lineGap, r);
        }
      }
    }

    function drawSystemLine(c, x, top, bottom, width) {
      c.save();
      c.strokeStyle = 'rgba(44, 33, 22, 0.9)';
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.stroke();
      c.restore();
    }

    function drawMiss(c, x, y, lineGap) {
      var s = lineGap * 0.55;
      c.save();
      c.strokeStyle = '#b42323';
      c.lineWidth = Math.max(1.6, lineGap * 0.12);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x - s, y - s);
      c.lineTo(x + s, y + s);
      c.moveTo(x + s, y - s);
      c.lineTo(x - s, y + s);
      c.stroke();
      c.restore();
    }

    function render(state) {
      lastState = state || lastState;
      state = lastState;
      if (!ctx || !canvas) return;
      var w = canvas.clientWidth || 360;
      var h = canvas.clientHeight || 96;
      if (w < 2 || h < 2) return;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = PARCHMENT;
      ctx.fillRect(0, 0, w, h);

      var gapRatio = TAPE_GAP;
      var stemPad = 2.85;
      var lineGap = (h - 8) / (8 + gapRatio + stemPad * 2);
      lineGap = Math.max(4.5, Math.min(16, lineGap));
      var staffH = lineGap * 4;
      var staffGap = lineGap * gapRatio;
      var block = staffH * 2 + staffGap;
      var pad = lineGap * stemPad;
      var topLine = Math.max(pad, (h - block) / 2);
      if (topLine + block + pad > h) topLine = Math.max(2, h - block - pad);
      var bottomLine = topLine + staffH;
      var bassTop = bottomLine + staffGap;
      var bassBottom = bassTop + staffH;
      var historyBeats = 3.2;
      var futureBeats = 11;
      var pxPerBeat = Math.max(8, (w - 8) / (historyBeats + futureBeats));
      var playheadX = 4 + historyBeats * pxPerBeat;
      var beat = state && typeof state.beat === 'number' ? state.beat : 0;
      var bpb = (state && state.beatsPerBar) || 4;
      var braceW = lineGap * BRACE_W;
      var sysX = braceW + 2;

      ctx.strokeStyle = '#2c2116';
      ctx.lineWidth = Math.max(1.2, lineGap * 0.09);
      var s;
      for (s = 0; s < 5; s++) {
        var sy = topLine + s * lineGap;
        ctx.beginPath();
        ctx.moveTo(sysX, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
        var by = bassTop + s * lineGap;
        ctx.beginPath();
        ctx.moveTo(sysX, by);
        ctx.lineTo(w, by);
        ctx.stroke();
      }

      var gLine = yFor(2, bottomLine, lineGap);
      var clefH = (lineGap + staffGap - 1) / (1 - CLEF_G);
      if (clefH > lineGap * 4.6) clefH = lineGap * 4.6;
      if (clefH < lineGap * 2.8) clefH = lineGap * 2.8;
      var clefW = clefH * (ready(clefImg) ? (clefImg.naturalWidth / clefImg.naturalHeight) : 0.36);
      var clefTop = gLine - CLEF_G * clefH;
      var clefRight = sysX + Math.max(3 + clefW, lineGap * (F_CLEF_W + 0.2));

      function xAt(absBeat) {
        return playheadX + (absBeat - beat) * pxPerBeat;
      }

      function drawAttackGuide(bar) {
        var marks = attackBeatMarks(bar.startBeat, bpb, beat);
        var mi;
        var m;
        var x;
        var on;
        var tickTop;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = '700 13px Georgia, serif';
        for (mi = 0; mi < marks.length; mi++) {
          m = marks[mi];
          x = xAt(m.beat);
          if (x < clefRight + 4 || x > w - 6) continue;
          on = !!m.current;
          tickTop = topLine - (on ? 11 : 8);
          ctx.strokeStyle = on ? 'rgba(122, 72, 16, 0.95)' : 'rgba(74, 52, 28, 0.72)';
          ctx.lineWidth = on ? 2 : 1.35;
          ctx.beginPath();
          ctx.moveTo(x, topLine - 1);
          ctx.lineTo(x, tickTop);
          ctx.stroke();
          if (tickTop > 16) {
            ctx.fillStyle = on ? 'rgba(110, 64, 12, 0.98)' : 'rgba(74, 52, 28, 0.78)';
            ctx.fillText(m.label, x, tickTop - 1);
          }
        }
        ctx.restore();
      }

      var bars = (state && (state.ribbon || state.upcoming)) || [];
      var i, j, bar, x0, x1, note, parts, nx;
      for (i = 0; i < bars.length; i++) {
        bar = bars[i];
        x0 = xAt(bar.startBeat);
        x1 = xAt(bar.startBeat + bpb);
        if (x1 < -8 || x0 > w + 8) continue;

        var zone = bar.listenOnly ? 'setup' : bar.kind;
        var wash = zone === 'hole' ? 'rgba(214, 170, 70, 0.30)'
          : (zone === 'defend' ? 'rgba(70, 180, 120, 0.26)' : 'rgba(80, 160, 220, 0.30)');
        var zx0 = Math.max(x0, 0);
        var zx1 = Math.min(x1, w);
        if (zx1 - zx0 > 2) {
          ctx.fillStyle = wash;
          ctx.fillRect(zx0, topLine - 1, zx1 - zx0, bassBottom - topLine + 2);
        }

        ctx.strokeStyle = 'rgba(90, 68, 40, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, topLine);
        ctx.lineTo(x0, bassBottom);
        ctx.stroke();

        var midY = (bottomLine + bassTop) / 2;
        var markX = Math.max(x0 + lineGap * 0.2, clefRight + 2);
        if (markX < x1 - lineGap * 0.5 && markX < w - 8) {
          drawZoneMark(ctx, markX, midY, zone, Math.max(9, lineGap * 0.72));
        }

        ctx.fillStyle = KIND_INK[zone] || '#5c4630';
        ctx.font = '700 ' + Math.round(Math.max(11, lineGap * 0.85)) + 'px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var numX = (Math.max(x0, clefRight) + Math.min(x1, w)) / 2;
        if (x1 - x0 > 22 && numX > clefRight + 8 && numX < w - 8) {
          ctx.fillText(String((bar.globalBar || 0) + 1), numX, midY);
        }
        ctx.textBaseline = 'alphabetic';

        if (bar.kind === 'hole') drawAttackGuide(bar);

        if (bar.kind === 'hole') continue;
        var notes = bar.notes || [];
        for (j = 0; j < notes.length; j++) {
          note = notes[j];
          var placed = placeNote(note.pitch, note.hand);
          if (!placed) continue;
          var shape = noteShape(note.dur);
          var staffBottom = placed.staff === 'bass' ? bassBottom : bottomLine;
          var ink = HAND_INK[placed.hand] || INK;
          var barBeat0 = bar.startBeat;
          nx = xAt(chartNoteBeat(barBeat0, note.beat));
          if (nx < clefRight - 2 || nx > w + 8) continue;
          var ny = yFor(placed.step, staffBottom, lineGap);
          if (placed.parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, ny, lineGap, ink);
          else if (placed.parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, ny, lineGap, ink);
          var chord = chordInfo(notes, note);
          var stemUp = chord ? chord.up : placed.step < STAFF_MIDDLE_STEP;
          if (note.tie && note.tieBack > 0) {
            var tieBelow = chord ? placed.step === chord.lo && placed.step !== chord.hi : stemUp;
            drawTie(ctx, xAt(chartNoteBeat(barBeat0, note.beat - note.tieBack)), nx, ny, tieBelow, lineGap, ink);
          }
          drawNote(ctx, nx, placed.step, staffBottom, lineGap, {
            color: ink, low: placed.low, high: placed.high, stemUp: stemUp,
            hollow: shape.hollow, stem: shape.stem, dot: shape.dot,
            stemFloor: placed.staff === 'bass' ? null : bassTop - lineGap * 0.35,
            stemCeil: placed.staff === 'bass' ? bottomLine + lineGap * 0.35 : null,
            ledgerMin: placed.staff === 'bass' ? bottomLine + lineGap * 0.45 : null,
            ledgerMax: placed.staff === 'bass' ? null : bassTop - lineGap * 0.45
          });
          var mark = fingerMark(note);
          if (note.accent) drawAccent(ctx, nx, ny, stemUp && shape.stem, lineGap, ink);
          if (mark) drawFingerNum(ctx, nx, ny, placed.step, mark, lineGap, ink, h, chord ? chordFingerY(notes, note, chord, !!mark.below, bottomLine, bassBottom, lineGap, shape.stem) : null);
        }
        drawBarRests(ctx, bar, bpb, xAt, bar.startBeat, bottomLine, bassBottom, lineGap, clefRight + 4, w - 4);
      }

      function rhythmPlace(parts) {
        var bass = parts.step <= -3;
        if (bass) return { step: parts.step + 12, low: -2, high: 10, color: HAND_INK.L };
        return { step: parts.step, low: -2, high: 10, color: null };
      }
      var improv = (state && state.improvNotes) || [];
      var improvTreble = [];
      var improvBass = [];
      for (i = 0; i < improv.length; i++) {
        parts = pitchParts(improv[i].pitch);
        if (parts && parts.step <= -3) improvBass.push(improv[i]);
        else improvTreble.push(improv[i]);
      }
      drawRhythm(ctx, improvTreble, xAt, bottomLine, lineGap, clefRight, w, rhythmPlace);
      drawRhythm(ctx, improvBass, xAt, bassBottom, lineGap, clefRight, w, rhythmPlace);

      var defendPlayed = (state && state.defendNotes) || [];
      for (i = 0; i < defendPlayed.length; i++) {
        note = defendPlayed[i];
        var hit = placeNote(note.pitch, note.hand);
        if (!hit) continue;
        var age = beat - note.beat;
        var vis = fuseVisual(note.sync, age);
        var px = xAt(note.beat);
        var tx = (typeof note.targetBeat === 'number') ? xAt(note.targetBeat) : px;
        var staffBottomHit = hit.staff === 'bass' ? bassBottom : bottomLine;
        var ty = yFor(hit.step, staffBottomHit, lineGap);
        var inkHit = HAND_INK[hit.hand] || HAND_INK.R;
        if (vis.glow > 0.02 && typeof note.targetBeat === 'number') {
          if (tx > clefRight - 8 && tx < w + 12) {
            drawHalo(ctx, tx, ty, lineGap, vis.glow, note.sync === 'perfect', inkHit);
          }
        }
        if (vis.sparkle > 0.02 && typeof note.targetBeat === 'number') {
          if (tx > -8 && tx < w + 12) drawSparkles(ctx, tx, ty, lineGap, vis.sparkle, age);
        }
        nx = px + (tx - px) * vis.lerp;
        if (!vis.showPlayer || nx < clefRight - 2 || nx > w + 12) continue;
        var col = vis.miss ? '#b42323' : inkHit;
        var headAlpha = vis.miss ? 0.95 : Math.max(0.35, 1 - vis.lerp * 0.45);
        if (hit.parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, ty, lineGap, col);
        else if (hit.parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, ty, lineGap, col);
        drawNote(ctx, nx, hit.step, staffBottomHit, lineGap, {
          color: col,
          hollow: !vis.miss,
          alpha: headAlpha,
          stemDown: true,
          scale: vis.miss ? 1 : vis.scale,
          low: hit.low,
          high: hit.high,
          stemFloor: hit.staff === 'bass' ? null : bassTop - lineGap * 0.35,
          stemCeil: hit.staff === 'bass' ? bottomLine + lineGap * 0.35 : null,
          ledgerMin: hit.staff === 'bass' ? bottomLine + lineGap * 0.45 : null,
          ledgerMax: hit.staff === 'bass' ? null : bassTop - lineGap * 0.45
        });
        if (vis.miss) drawMiss(ctx, nx, ty, lineGap);
      }

      if (ready(clefImg)) {
        ctx.drawImage(clefImg, sysX + 1, clefTop, clefW, clefH);
      }
      drawBassClef(ctx, sysX + 2, bassBottom, lineGap);
      drawSystemLine(ctx, sysX, topLine, bassBottom, Math.max(1.5, lineGap * 0.16));
      drawBrace(ctx, 1, topLine, bassBottom, braceW);

      var beatFrac = beat - Math.floor(beat);
      var pulse = state && state.running && !state.paused && beatFrac >= BEAT_CENTER && beatFrac < BEAT_CENTER + 0.12;
      ctx.save();
      ctx.shadowColor = pulse ? 'rgba(255, 214, 120, 0.95)' : 'rgba(120, 186, 230, 0.9)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = pulse ? '#fff6d8' : '#eef7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, topLine - 4);
      ctx.lineTo(playheadX, bassBottom + 4);
      ctx.stroke();
      ctx.fillStyle = pulse ? '#ffe7a3' : '#f7fbff';
      ctx.beginPath();
      ctx.moveTo(playheadX, topLine - 8);
      ctx.lineTo(playheadX + 5, topLine);
      ctx.lineTo(playheadX, topLine + 8);
      ctx.lineTo(playheadX - 5, topLine);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'left';
    }

    function renderSheet(model) {
      lastSheet = model || lastSheet;
      model = lastSheet;
      if (!ctx || !canvas || !model) return;
      resize();
      var w = canvas.clientWidth || 360;
      var h = canvas.clientHeight || 96;
      if (w < 2 || h < 2) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = PARCHMENT;
      ctx.fillRect(0, 0, w, h);
      var gapRatio = staffGapFor(model.bars, SHEET_GAP_MIN);
      var stemPad = 2.85;
      var lineGap = (h - 8) / (8 + gapRatio + stemPad * 2);
      lineGap = Math.max(4.5, Math.min(16, lineGap));
      var staffH = lineGap * 4;
      var staffGap = lineGap * gapRatio;
      var block = staffH * 2 + staffGap;
      var pad = lineGap * stemPad;
      var topLine = Math.max(pad, (h - block) / 2);
      if (topLine + block + pad > h) topLine = Math.max(2, h - block - pad);
      var bottomLine = topLine + staffH;
      var bassTop = bottomLine + staffGap;
      var bassBottom = bassTop + staffH;
      var bars = model.bars || [];
      var bpb = model.bpb || 4;
      var total = Math.max(1, bars.length * bpb);
      var braceW = lineGap * BRACE_W;
      var sysX = braceW + 2;
      var padL = sysX + Math.max(28, lineGap * (F_CLEF_W + 0.6));
      var padR = 12;
      var pxPerBeat = (w - padL - padR) / total;
      if (pxPerBeat < 1) pxPerBeat = 1;
      sheetGeom = { padL: padL, pxPerBeat: pxPerBeat, bpb: bpb, count: bars.length };
      function xAt(absBeat) { return padL + absBeat * pxPerBeat; }
      ctx.strokeStyle = '#2c2116';
      ctx.lineWidth = Math.max(1.2, lineGap * 0.09);
      var s;
      for (s = 0; s < 5; s++) {
        var sy = topLine + s * lineGap;
        ctx.beginPath();
        ctx.moveTo(sysX, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
        var by = bassTop + s * lineGap;
        ctx.beginPath();
        ctx.moveTo(sysX, by);
        ctx.lineTo(w, by);
        ctx.stroke();
      }
      var from = typeof model.from === 'number' ? model.from : 0;
      var to = typeof model.to === 'number' ? model.to : bars.length;
      if (to > from) {
        var sx0 = xAt(from * bpb);
        var sx1 = xAt(to * bpb);
        ctx.save();
        ctx.strokeStyle = '#8a5a12';
        ctx.lineWidth = 3;
        ctx.strokeRect(sx0 + 1.5, topLine - 4, Math.max(1, sx1 - sx0 - 3), bassBottom - topLine + 8);
        ctx.restore();
      }
      var i;
      var j;
      var bar;
      var x0;
      var x1;
      var note;
      var nx;
      for (i = 0; i < bars.length; i++) {
        bar = bars[i];
        x0 = xAt(bar.startBeat || i * bpb);
        x1 = xAt((bar.startBeat || i * bpb) + bpb);
        var zone = bar.kind;
        var wash = zone === 'hole' ? 'rgba(214, 170, 70, 0.30)'
          : (zone === 'defend' ? 'rgba(70, 180, 120, 0.26)' : 'rgba(80, 160, 220, 0.30)');
        ctx.fillStyle = wash;
        ctx.fillRect(x0, topLine - 1, Math.max(1, x1 - x0), bassBottom - topLine + 2);
        ctx.strokeStyle = 'rgba(90, 68, 40, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, topLine);
        ctx.lineTo(x0, bassBottom);
        ctx.stroke();
        var midY = Math.max(lineGap * 0.6, topLine - lineGap * 2.15);
        var markX = x0 + lineGap * 0.6;
        if (markX < x1 - lineGap * 0.5) drawZoneMark(ctx, markX, midY, zone, Math.max(8, lineGap * 0.62));
        ctx.fillStyle = KIND_INK[zone] || '#5c4630';
        ctx.font = '700 ' + Math.round(Math.max(10, lineGap * 0.8)) + 'px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (x1 - x0 > 18) ctx.fillText(String((bar.index != null ? bar.index : i) + 1), (x0 + x1) / 2, midY);
        ctx.textBaseline = 'alphabetic';
        if (zone === 'hole') continue;
        var notes = bar.notes || [];
        for (j = 0; j < notes.length; j++) {
          note = notes[j];
          var placed = placeNote(note.pitch, note.hand);
          if (!placed) continue;
          var shape = noteShape(note.dur);
          var staffBottom = placed.staff === 'bass' ? bassBottom : bottomLine;
          var ink = HAND_INK[placed.hand] || INK;
          var barBeat0 = bar.startBeat || i * bpb;
          nx = xAt(chartNoteBeat(barBeat0, note.beat));
          var ny = yFor(placed.step, staffBottom, lineGap);
          if (placed.parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, ny, lineGap, ink);
          else if (placed.parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, ny, lineGap, ink);
          var chord = chordInfo(notes, note);
          var stemUp = chord ? chord.up : placed.step < STAFF_MIDDLE_STEP;
          if (note.tie && note.tieBack > 0) {
            var tieBelow = chord ? placed.step === chord.lo && placed.step !== chord.hi : stemUp;
            drawTie(ctx, xAt(chartNoteBeat(barBeat0, note.beat - note.tieBack)), nx, ny, tieBelow, lineGap, ink);
          }
          drawNote(ctx, nx, placed.step, staffBottom, lineGap, {
            color: ink, low: placed.low, high: placed.high, stemUp: stemUp,
            hollow: shape.hollow, stem: shape.stem, dot: shape.dot,
            stemFloor: placed.staff === 'bass' ? null : bassTop - lineGap * 0.35,
            stemCeil: placed.staff === 'bass' ? bottomLine + lineGap * 0.35 : null,
            ledgerMin: placed.staff === 'bass' ? bottomLine + lineGap * 0.45 : null,
            ledgerMax: placed.staff === 'bass' ? null : bassTop - lineGap * 0.45
          });
          var finger = fingerMark(note);
          if (note.accent) drawAccent(ctx, nx, ny, stemUp && shape.stem, lineGap, ink);
          if (finger) drawFingerNum(ctx, nx, ny, placed.step, finger, lineGap, ink, h, chord ? chordFingerY(notes, note, chord, !!finger.below, bottomLine, bassBottom, lineGap, shape.stem) : null);
        }
        drawBarRests(ctx, bar, bpb, xAt, bar.startBeat || i * bpb, bottomLine, bassBottom, lineGap, 0, w);
      }
      var gLine = yFor(2, bottomLine, lineGap);
      var clefH = (lineGap + staffGap - 1) / (1 - CLEF_G);
      if (clefH > lineGap * 4.6) clefH = lineGap * 4.6;
      if (clefH < lineGap * 2.8) clefH = lineGap * 2.8;
      var clefW = clefH * (ready(clefImg) ? (clefImg.naturalWidth / clefImg.naturalHeight) : 0.36);
      var clefTop = gLine - CLEF_G * clefH;
      if (ready(clefImg)) ctx.drawImage(clefImg, sysX + 1, clefTop, clefW, clefH);
      drawBassClef(ctx, sysX + 2, bassBottom, lineGap);
      drawSystemLine(ctx, sysX, topLine, bassBottom, Math.max(1.5, lineGap * 0.16));
      drawBrace(ctx, 1, topLine, bassBottom, braceW);
      if (typeof model.beat === 'number' && isFinite(model.beat)) {
        var playX = xAt(model.beat);
        if (playX >= 0 && playX <= w) {
          ctx.save();
          ctx.strokeStyle = '#6a3d12';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(playX, topLine - 6);
          ctx.lineTo(playX, bassBottom + 6);
          ctx.stroke();
          ctx.fillStyle = '#6a3d12';
          ctx.beginPath();
          ctx.moveTo(playX, topLine - 10);
          ctx.lineTo(playX + 5, topLine - 3);
          ctx.lineTo(playX - 5, topLine - 3);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.textAlign = 'left';
    }

    function barIndexAt(x) {
      if (!sheetGeom || !(sheetGeom.pxPerBeat > 0)) return -1;
      var beat = (x - sheetGeom.padL) / sheetGeom.pxPerBeat;
      if (!(beat >= 0)) return -1;
      var idx = Math.floor(beat / sheetGeom.bpb + 1e-9);
      if (idx < 0 || idx >= sheetGeom.count) return -1;
      return idx;
    }

    if (clefImg) clefImg.onload = function () {
      if (lastState) render(lastState);
      if (lastSheet) renderSheet(lastSheet);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', function () {
        resize();
        if (lastState) render(lastState);
        if (lastSheet) renderSheet(lastSheet);
      });
    }
    resize();

    return { render: render, resize: resize, renderSheet: renderSheet, barIndexAt: barIndexAt };
  }

  return {
    create: create,
    staffStep: staffStep,
    placeNote: placeNote,
    pitchParts: pitchParts,
    HAND_INK: HAND_INK,
    fuseVisual: fuseVisual,
    attackBeatMarks: attackBeatMarks,
    chartNoteBeat: chartNoteBeat,
    fingerMark: fingerMark,
    noteShape: noteShape,
    staffGapFor: staffGapFor,
    handRests: handRests,
    chordInfo: chordInfo,
    BEAT_CENTER: BEAT_CENTER,
    KIND_LABEL: KIND_LABEL
  };
});
