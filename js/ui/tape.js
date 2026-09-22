// js/ui/tape.js — cinta continua sobre el pergamino: fichas, hueco, playhead fijo.
// UMD: module.exports + window.Tape. Sin CDN.
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

  function loadImage(src) {
    if (typeof Image === 'undefined' || !src) return null;
    var img = new Image();
    img.src = src;
    return img;
  }

  function ready(img) {
    return !!(img && img.complete && img.naturalWidth);
  }

  function create(canvas, opts) {
    opts = opts || {};
    var version = opts.version || '0.1.2';
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var noteImg = loadImage(opts.noteTile || ('assets/ui/note-tile.png?v=' + version));
    var huecoImg = loadImage(opts.hueco || ('assets/ui/hueco-slot.png?v=' + version));
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

    function pitchLabel(pitch) {
      var s = String(pitch || '');
      return s.replace(/4$/, '');
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

      var playheadX = Math.max(16, Math.min(48, w * 0.07));
      var usable = Math.max(40, w - playheadX - 8);
      var beatsAhead = Math.max(10, Math.min(14, usable / 36));
      var pxPerBeat = usable / beatsAhead;
      var beat = state && typeof state.beat === 'number' ? state.beat : 0;
      var bpb = (state && state.beatsPerBar) || 4;
      var tile = Math.max(16, Math.min(46, pxPerBeat * 0.9, h - 16));
      var rowY = Math.max(14, (h - tile) / 2 + 2);

      ctx.strokeStyle = 'rgba(120, 96, 62, 0.22)';
      ctx.lineWidth = 1;
      var s;
      for (s = 0; s < 5; s++) {
        var sy = 14 + s * ((h - 20) / 4);
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }

      var upcoming = (state && state.upcoming) || [];
      var i, j, bar, x0, x1, note, nx;
      for (i = 0; i < upcoming.length; i++) {
        bar = upcoming[i];
        x0 = playheadX + (bar.startBeat - beat) * pxPerBeat;
        x1 = playheadX + (bar.startBeat + bpb - beat) * pxPerBeat;
        if (x1 < -20 || x0 > w + 20) continue;

        ctx.strokeStyle = 'rgba(150, 120, 70, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, 2);
        ctx.lineTo(x0, h);
        ctx.stroke();

        ctx.fillStyle = '#6a5438';
        ctx.font = '700 11px Georgia, serif';
        ctx.textAlign = 'center';
        var numX = (Math.max(x0, 0) + Math.min(x1, w)) / 2;
        if (numX > 8 && numX < w - 8) ctx.fillText(String((bar.globalBar || 0) + 1), numX, 12);

        ctx.textAlign = 'left';
        ctx.font = '700 9px Georgia, serif';
        ctx.fillStyle = KIND_INK[bar.kind] || '#5c4630';
        var label = KIND_LABEL[bar.kind] || bar.kind;
        if (bar.listenOnly) label = 'ESCUCHA';
        if (x0 < w - 40) ctx.fillText(label, Math.max(x0 + 4, 2), h - 4);

        if (bar.kind === 'hole') {
          var hw = Math.min(Math.max(36, x1 - x0 - 16), tile * 1.85);
          var hh = Math.min(h - 18, tile * 1.25);
          var hx = (x0 + x1) / 2 - hw / 2;
          var hy = (h - hh) / 2;
          if (ready(huecoImg)) {
            ctx.drawImage(huecoImg, hx, hy, hw, hh);
          } else {
            ctx.save();
            ctx.strokeStyle = '#e0b44a';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            roundRect(ctx, hx, hy, hw, hh, 8);
            ctx.stroke();
            ctx.restore();
          }
        }

        var notes = bar.notes || [];
        for (j = 0; j < notes.length; j++) {
          note = notes[j];
          nx = playheadX + (bar.startBeat + note.beat - beat) * pxPerBeat - tile * 0.35;
          if (nx > w || nx + tile < -8) continue;
          if (ready(noteImg)) {
            ctx.drawImage(noteImg, nx, rowY, tile, tile * 0.92);
          } else {
            ctx.fillStyle = '#f7f1e4';
            ctx.strokeStyle = '#c6a15a';
            roundRect(ctx, nx, rowY, tile * 0.9, tile * 0.9, 6);
            ctx.fill();
            ctx.stroke();
          }
          var pl = pitchLabel(note.pitch);
          ctx.font = '700 ' + Math.max(9, Math.round(tile * 0.28)) + 'px Georgia, serif';
          ctx.textAlign = 'center';
          var tw = ctx.measureText(pl).width;
          var lx = nx + tile * 0.42;
          var ly = rowY + tile * 0.72;
          ctx.fillStyle = 'rgba(255, 248, 236, 0.9)';
          roundRect(ctx, lx - tw / 2 - 3, ly - 11, tw + 6, 14, 3);
          ctx.fill();
          ctx.fillStyle = '#2c2418';
          ctx.fillText(pl, lx, ly);
        }
      }

      var pulse = state && state.running && ((state.beat % 1) < 0.12);
      ctx.save();
      ctx.shadowColor = pulse ? 'rgba(255, 214, 120, 0.95)' : 'rgba(186, 230, 255, 0.95)';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = pulse ? '#fff6d8' : '#f4fbff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      ctx.fillStyle = pulse ? '#ffe7a3' : '#f7fbff';
      ctx.beginPath();
      ctx.moveTo(playheadX, 1);
      ctx.lineTo(playheadX + 6, 9);
      ctx.lineTo(playheadX, 17);
      ctx.lineTo(playheadX - 6, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'left';
    }

    if (noteImg) noteImg.onload = function () { if (lastState) render(lastState); };
    if (huecoImg) huecoImg.onload = function () { if (lastState) render(lastState); };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', function () {
        resize();
        if (lastState) render(lastState);
      });
    }
    resize();

    return { render: render, resize: resize };
  }

  return { create: create };
});
