// js/ui/tape.js — pentagrama continuo sobre el pergamino.
// Cabezas, plicas, alteraciones y líneas adicionales. Playhead fijo.
// El agujero es un marco en el mismo pentagrama. Sin VexFlow ni CDN:
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

  var KIND_INK = { setup: '#1d4e89', defend: '#1b6b42', hole: '#6d3d96' };
  var KIND_LABEL = { setup: 'ESCUCHA', defend: 'DEFIENDE', hole: 'AGUJERO' };
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

  function create(canvas, opts) {
    opts = opts || {};
    var version = opts.version || '0.1.3';
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

    function drawSharp(c, x, y, lineGap) {
      var h = lineGap * 1.25;
      var w = lineGap * 0.42;
      c.strokeStyle = INK;
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

    function drawFlat(c, x, y, lineGap) {
      var h = lineGap * 1.35;
      c.strokeStyle = INK;
      c.fillStyle = INK;
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

    function drawNote(c, x, step, bottomLine, lineGap) {
      var y = yFor(step, bottomLine, lineGap);
      var rx = Math.max(4, lineGap * 0.52);
      var ry = Math.max(2.8, lineGap * 0.38);
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
      var up = step < 4;
      var stemH = lineGap * 3.15;
      c.strokeStyle = INK;
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
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
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
          nx = xAt(bar.startBeat + note.beat);
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

      if (ready(clefImg)) {
        ctx.drawImage(clefImg, 1, clefTop, clefW, clefH);
      }

      var pulse = state && state.running && ((state.beat % 1) < 0.12);
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
    pitchParts: pitchParts
  };
});
