// js/ui/tape.js — pentagrama continuo sobre el pergamino.
// Cabezas, plicas, alteraciones y líneas adicionales. Playhead fijo.
// El ataque (kind hole) es un marco en el mismo pentagrama. Sin VexFlow ni CDN:
// la cinta es un ribbon que se desplaza, no una partitura de compases estáticos.
// UMD: module.exports + window.Tape.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Tape = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Mismo centro que Chart.BEAT_CENTER: el tiempo del JSON, más medio beat.
  var BEAT_CENTER = 0.5;
  var KIND_INK = { setup: '#1d4e89', defend: '#1b6b42', hole: '#6d3d96' };
  var KIND_LABEL = { setup: 'ESCUCHA', defend: 'DEFIENDE', hole: 'ATAQUE' };
  var PARCHMENT = '#efe6d2';
  var INK = '#1c140c';
  // Fracción desde el tope del glifo (treble-clef.png) hasta la línea de Sol.
  var CLEF_G = 0.486;
  var LETTER = { C: -2, D: -1, E: 0, F: 1, G: 2, A: 3, B: 4 };

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

  function staffStep(pitch) {
    var p = pitchParts(pitch);
    return p ? p.step : null;
  }

  /**
   * Marcas de pulso dentro de un compás de Ataque (kind hole).
   * La barra de compás es el divisor (beat onset 0). El número 1 no va
   * encima de esa línea: cada marca se centra en su cuarto
   * (onset + BEAT_CENTER), así 1 queda dentro del primer tiempo y 2–4
   * siguen a un beat de distancia, antes de la barra siguiente.
   * Las cabezas del chart usan el mismo centro (`chartNoteBeat`).
   * current sigue el cuarto que contiene playBeat, no la x del glifo.
   */
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

  /**
   * Presentación de un NoteOn de Defend.
   * perfect brilla más y funde más rápido que partial.
   * fail no se funde: la nota queda en su beat.
   * ageBeats es el tiempo de cinta desde el onset (la pausa lo congela).
   */
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
    var version = opts.version || '0.1.7';
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var clefImg = loadImage(opts.clef || ('assets/ui/treble-clef.png?v=' + version));
    var lastState = null;

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

    function drawLedger(c, x, y, lineGap) {
      var hw = lineGap * 0.95;
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
      var ls;
      if (step <= -2) {
        for (ls = -2; ls >= step; ls -= 2) drawLedger(c, x, yFor(ls, bottomLine, lineGap), lineGap);
      }
      if (step >= 10) {
        for (ls = 10; ls <= step; ls += 2) drawLedger(c, x, yFor(ls, bottomLine, lineGap), lineGap);
      }
      var up = stemDown ? false : step < 4;
      var stemH = lineGap * 3.15;
      c.strokeStyle = color;
      c.lineWidth = Math.max(1, lineGap * 0.1);
      c.beginPath();
      if (up) {
        c.moveTo(x + rx * 0.82, y + ry * 0.1);
        c.lineTo(x + rx * 0.82, y - stemH);
      } else {
        c.moveTo(x - rx * 0.82, y - ry * 0.1);
        c.lineTo(x - rx * 0.82, y + stemH);
      }
      c.stroke();
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

    function drawHalo(c, x, y, lineGap, glow, strong) {
      if (glow <= 0.02) return;
      c.save();
      c.globalAlpha = 0.3 + 0.7 * glow;
      c.strokeStyle = strong ? '#ffe7a0' : '#f0b45a';
      c.lineWidth = strong ? 3.2 : 1.8;
      c.shadowColor = strong ? 'rgba(255, 220, 120, 0.98)' : 'rgba(230, 160, 60, 0.75)';
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

      // El pentagrama ocupa el centro del pergamino y deja sitio a C4 (línea adicional).
      var lineGap = Math.max(7, Math.min(13, (h - 20) / 6.4));
      var staffH = lineGap * 4;
      var bottomLine = (h + staffH) / 2 + lineGap * 0.15;
      if (bottomLine + lineGap > h - 6) bottomLine = h - 6 - lineGap;
      var topLine = bottomLine - staffH;
      if (topLine < 14) {
        bottomLine += 14 - topLine;
        topLine = 14;
      }

      var historyBeats = 3.2;
      var futureBeats = 11;
      var pxPerBeat = Math.max(8, (w - 8) / (historyBeats + futureBeats));
      var playheadX = 4 + historyBeats * pxPerBeat;
      var beat = state && typeof state.beat === 'number' ? state.beat : 0;
      var bpb = (state && state.beatsPerBar) || 4;

      ctx.strokeStyle = '#2c2116';
      ctx.lineWidth = Math.max(1.6, lineGap * 0.11);
      var s;
      for (s = 0; s < 5; s++) {
        var sy = topLine + s * lineGap;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }

      var clefH = lineGap * 7.15;
      var clefW = clefH * (ready(clefImg) ? (clefImg.naturalWidth / clefImg.naturalHeight) : 0.36);
      var gLine = yFor(2, bottomLine, lineGap);
      var clefTop = gLine - CLEF_G * clefH;
      var clefRight = 4 + clefW;

      function xAt(absBeat) {
        return playheadX + (absBeat - beat) * pxPerBeat;
      }

      // Ticks y números 1–2–3–4 por encima del pentagrama: no tapan las cabezas.
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
        ctx.font = '700 10px Georgia, serif';
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

        ctx.strokeStyle = 'rgba(90, 68, 40, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, topLine);
        ctx.lineTo(x0, bottomLine);
        ctx.stroke();

        if (bar.kind === 'hole') {
          var hx0 = Math.max(x0, clefRight);
          var hx1 = Math.min(x1, w);
          if (hx1 - hx0 > 6) {
            ctx.save();
            ctx.fillStyle = 'rgba(214, 176, 92, 0.16)';
            ctx.strokeStyle = '#b8893a';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([4, 3]);
            roundRect(ctx, hx0 + 1, topLine - 3, hx1 - hx0 - 2, (bottomLine - topLine) + 6, 5);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          drawAttackGuide(bar);
        }

        ctx.fillStyle = '#5c4630';
        ctx.font = '700 10px Georgia, serif';
        ctx.textAlign = 'center';
        var numX = (Math.max(x0, 0) + Math.min(x1, w)) / 2;
        if (numX > 18 && numX < w - 10) ctx.fillText(String((bar.globalBar || 0) + 1), numX, 11);

        ctx.textAlign = 'left';
        ctx.font = '700 8px Georgia, serif';
        ctx.fillStyle = KIND_INK[bar.kind] || '#5c4630';
        var label = KIND_LABEL[bar.kind] || bar.kind;
        if (bar.listenOnly) label = 'ESCUCHA';
        var labelX = Math.max(x0 + 3, clefRight);
        if (labelX < x1 - 28 && labelX < w - 36) ctx.fillText(label, labelX, h - 3);

        if (bar.kind === 'hole') continue;
        var notes = bar.notes || [];
        for (j = 0; j < notes.length; j++) {
          note = notes[j];
          parts = pitchParts(note.pitch);
          if (!parts) continue;
          nx = xAt(chartNoteBeat(bar.startBeat, note.beat));
          if (nx < clefRight - 2 || nx > w + 8) continue;
          if (parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, yFor(parts.step, bottomLine, lineGap), lineGap);
          else if (parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, yFor(parts.step, bottomLine, lineGap), lineGap);
          drawNote(ctx, nx, parts.step, bottomLine, lineGap);
        }
      }

      var improv = (state && state.improvNotes) || [];
      for (i = 0; i < improv.length; i++) {
        note = improv[i];
        parts = pitchParts(note.pitch);
        if (!parts) continue;
        nx = xAt(note.beat);
        if (nx < clefRight - 2 || nx > w + 12) continue;
        if (parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, yFor(parts.step, bottomLine, lineGap), lineGap);
        else if (parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, yFor(parts.step, bottomLine, lineGap), lineGap);
        drawNote(ctx, nx, parts.step, bottomLine, lineGap);
      }

      var defendPlayed = (state && state.defendNotes) || [];
      for (i = 0; i < defendPlayed.length; i++) {
        note = defendPlayed[i];
        parts = pitchParts(note.pitch);
        if (!parts) continue;
        var age = beat - note.beat;
        var vis = fuseVisual(note.sync, age);
        var px = xAt(note.beat);
        var tx = (typeof note.targetBeat === 'number') ? xAt(note.targetBeat) : px;
        var ty = yFor(parts.step, bottomLine, lineGap);
        if (vis.glow > 0.02 && typeof note.targetBeat === 'number') {
          if (tx > clefRight - 8 && tx < w + 12) {
            drawHalo(ctx, tx, ty, lineGap, vis.glow, note.sync === 'perfect');
          }
        }
        if (vis.sparkle > 0.02 && typeof note.targetBeat === 'number') {
          if (tx > -8 && tx < w + 12) drawSparkles(ctx, tx, ty, lineGap, vis.sparkle, age);
        }
        nx = px + (tx - px) * vis.lerp;
        if (!vis.showPlayer || nx < clefRight - 2 || nx > w + 12) continue;
        var col = vis.miss ? '#b42323' : (vis.lerp > 0.62 ? '#e2b15a' : '#1a4f8b');
        var headAlpha = vis.miss ? 0.95 : Math.max(0.15, 1 - vis.lerp * 0.9);
        if (parts.acc === '#') drawSharp(ctx, nx - lineGap * 0.85, ty, lineGap, col);
        else if (parts.acc === 'b') drawFlat(ctx, nx - lineGap * 0.7, ty, lineGap, col);
        drawNote(ctx, nx, parts.step, bottomLine, lineGap, {
          color: col,
          hollow: !vis.miss,
          alpha: headAlpha,
          stemDown: true,
          scale: vis.miss ? 1 : vis.scale
        });
        if (vis.miss) drawMiss(ctx, nx, ty, lineGap);
      }

      if (ready(clefImg)) {
        ctx.drawImage(clefImg, 1, clefTop, clefW, clefH);
      }

      var beatFrac = beat - Math.floor(beat);
      var pulse = state && state.running && !state.paused && beatFrac >= BEAT_CENTER && beatFrac < BEAT_CENTER + 0.12;
      ctx.save();
      ctx.shadowColor = pulse ? 'rgba(255, 214, 120, 0.95)' : 'rgba(120, 186, 230, 0.9)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = pulse ? '#fff6d8' : '#eef7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, topLine - 6);
      ctx.lineTo(playheadX, bottomLine + 6);
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

    if (clefImg) clefImg.onload = function () { if (lastState) render(lastState); };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', function () {
        resize();
        if (lastState) render(lastState);
      });
    }
    resize();

    return { render: render, resize: resize };
  }

  return {
    create: create,
    staffStep: staffStep,
    pitchParts: pitchParts,
    fuseVisual: fuseVisual,
    attackBeatMarks: attackBeatMarks,
    chartNoteBeat: chartNoteBeat,
    BEAT_CENTER: BEAT_CENTER,
    KIND_LABEL: KIND_LABEL
  };
});
