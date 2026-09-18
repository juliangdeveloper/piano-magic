// js/ui/tape.js — cinta continua: playhead fijo, compases siguientes en la misma cinta.
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

  var LANES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  var KIND_COLOR = { setup: '#38bdf8', defend: '#4ade80', hole: '#c084fc' };
  var KIND_LABEL = { setup: 'ESCUCHA', defend: 'DEFIENDE', hole: 'AGUJERO' };

  function create(canvas) {
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

    function resize() {
      if (!canvas || !ctx) return;
      var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      var cssW = canvas.clientWidth || 360;
      var cssH = canvas.clientHeight || 168;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function laneY(h, pitch, top, laneH) {
      var i = LANES.indexOf(pitch);
      if (i < 0) i = 0;
      return top + i * laneH + laneH * 0.15;
    }

    function render(state) {
      if (!ctx || !canvas) return;
      var w = canvas.clientWidth || 360;
      var h = canvas.clientHeight || 168;
      ctx.clearRect(0, 0, w, h);

      var playheadX = 56;
      var beatsAhead = 8;
      var pxPerBeat = (w - playheadX - 10) / beatsAhead;
      var beat = state && typeof state.beat === 'number' ? state.beat : 0;
      var bpb = (state && state.beatsPerBar) || 4;
      var top = 22;
      var laneH = (h - top - 8) / LANES.length;

      ctx.fillStyle = '#0e1218';
      ctx.fillRect(0, 0, w, h);

      // Bandas de compás + notas
      var upcoming = (state && state.upcoming) || [];
      var i, j, bar, x0, x1, note, nx, nw, ny;
      for (i = 0; i < upcoming.length; i++) {
        bar = upcoming[i];
        x0 = playheadX + (bar.startBeat - beat) * pxPerBeat;
        x1 = playheadX + (bar.startBeat + bpb - beat) * pxPerBeat;
        if (x1 < 0 || x0 > w) continue;

        ctx.globalAlpha = 0.12;
        ctx.fillStyle = KIND_COLOR[bar.kind] || '#888';
        ctx.fillRect(Math.max(0, x0), 0, Math.min(w, x1) - Math.max(0, x0), h);
        ctx.globalAlpha = 1;

        ctx.fillStyle = KIND_COLOR[bar.kind] || '#888';
        ctx.fillRect(x0, 0, 2, h);

        ctx.font = '700 10px sans-serif';
        ctx.fillStyle = KIND_COLOR[bar.kind] || '#888';
        var label = KIND_LABEL[bar.kind] || bar.kind;
        if (bar.listenOnly) label = 'ESCUCHA';
        ctx.fillText(label, Math.max(x0 + 6, 4), 14);

        if (bar.kind === 'hole') {
          ctx.font = '600 11px sans-serif';
          ctx.fillStyle = 'rgba(192,132,252,0.7)';
          ctx.fillText('improvisa', x0 + 8, h / 2);
        }

        var notes = bar.notes || [];
        for (j = 0; j < notes.length; j++) {
          note = notes[j];
          nx = playheadX + (bar.startBeat + note.beat - beat) * pxPerBeat;
          nw = Math.max(10, (note.dur || 1) * pxPerBeat - 6);
          if (nx + nw < 0 || nx > w) continue;
          ny = laneY(h, note.pitch, top, laneH);
          var hit = state && state.running && Math.abs((bar.startBeat + note.beat) - beat) < 0.2;
          ctx.fillStyle = hit ? '#f8fafc' : '#e2e8f0';
          roundRect(ctx, nx, ny, nw, laneH * 0.7, 4);
          ctx.fill();
          ctx.fillStyle = '#0b0d10';
          ctx.font = '700 9px sans-serif';
          ctx.fillText(note.pitch.replace('4', ''), nx + 4, ny + laneH * 0.52);
        }
      }

      // Líneas de pulso
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      var firstBeat = Math.floor(beat) - 1;
      for (i = firstBeat; i < beat + beatsAhead + 1; i++) {
        var bx = playheadX + (i - beat) * pxPerBeat;
        ctx.beginPath();
        ctx.moveTo(bx, top);
        ctx.lineTo(bx, h);
        ctx.stroke();
      }

      // Playhead fijo
      var pulse = state && ((state.beat % 1) < 0.12);
      ctx.strokeStyle = pulse ? '#f59e0b' : '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      ctx.fillStyle = pulse ? '#f59e0b' : '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();
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

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', resize);
    }
    resize();

    return { render: render, resize: resize };
  }

  return { create: create, LANES: LANES };
});
