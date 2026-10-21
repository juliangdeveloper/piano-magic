// js/ui/boss-anim.js — pose de un spritesheet sobre el reloj del combate.
// Idle: un cuadro por pulso, alineado con Chart.centerReached.
// Cast: seis cuadros en un tiempo; el cuadro 3 (golpe) empieza en el hit.
// El hit es el centro del tiempo, el mismo instante que la melodía del jefe.
// UMD: module.exports + window.BossAnim.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BossAnim = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CELL = 192;
  var IDLE_FRAMES = 4;
  var CAST_FRAMES = 6;
  var CAST_HIT = 3;
  var CAST_SPAN = 1;
  var BEAT_CENTER = 0.5;

  function centerReached(beat) {
    if (typeof beat !== 'number' || !isFinite(beat)) return -1;
    return Math.floor(beat - BEAT_CENTER + 1e-6);
  }

  // Cuadro del cast si `beat` cae en la ventana de ese golpe; −1 si no.
  // La ventana dura un tiempo y el cuadro CAST_HIT empieza en `hit`.
  function castFrameAt(beat, hit) {
    var start;
    var f;
    var n;
    if (typeof beat !== 'number' || typeof hit !== 'number') return -1;
    if (!isFinite(beat) || !isFinite(hit)) return -1;
    start = hit - (CAST_HIT * CAST_SPAN) / CAST_FRAMES;
    f = (beat - start) * CAST_FRAMES / CAST_SPAN;
    if (f < -1e-6 || f >= CAST_FRAMES - 1e-9) return -1;
    n = Math.floor(f + 1e-9);
    if (n < 0) n = 0;
    if (n >= CAST_FRAMES) return -1;
    return n;
  }

  // Golpes del jefe: notas de setup y defend, en el centro del tiempo.
  // El ataque (hole) no suena y no dispara el cast.
  function attackHits(ribbon) {
    var hits = [];
    var bars = ribbon || [];
    var i;
    var j;
    var bar;
    var notes;
    for (i = 0; i < bars.length; i++) {
      bar = bars[i];
      if (!bar || bar.kind === 'hole') continue;
      if (bar.kind !== 'defend' && bar.kind !== 'setup') continue;
      notes = bar.notes || [];
      for (j = 0; j < notes.length; j++) {
        if (!notes[j] || typeof notes[j].beat !== 'number' || !isFinite(notes[j].beat)) continue;
        hits.push((bar.startBeat || 0) + notes[j].beat + BEAT_CENTER);
      }
    }
    return hits;
  }

  function pose(beat, hits) {
    var best = -1;
    var bestDist = Infinity;
    var i;
    var frame;
    var dist;
    var pulse;
    hits = hits || [];
    for (i = 0; i < hits.length; i++) {
      frame = castFrameAt(beat, hits[i]);
      if (frame < 0) continue;
      dist = Math.abs(beat - hits[i]);
      if (dist < bestDist) {
        bestDist = dist;
        best = frame;
      }
    }
    if (best >= 0) return { row: 1, frame: best, state: 'cast' };
    pulse = centerReached(beat);
    if (pulse < 0) pulse = 0;
    return {
      row: 0,
      frame: ((pulse % IDLE_FRAMES) + IDLE_FRAMES) % IDLE_FRAMES,
      state: 'idle'
    };
  }

  function draw(canvas, img, beat, hits) {
    var cssW;
    var cssH;
    var dpr;
    var bw;
    var bh;
    var ctx;
    var p;
    var scale;
    var dw;
    var dh;
    var dx;
    var dy;
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (dpr < 1) dpr = 1;
    bw = Math.max(1, Math.round(cssW * dpr));
    bh = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    p = pose(beat, hits);
    scale = Math.min(bw / CELL, bh / CELL);
    dw = CELL * scale;
    dh = CELL * scale;
    dx = (bw - dw) / 2;
    dy = bh - dh;
    ctx.drawImage(img, p.frame * CELL, p.row * CELL, CELL, CELL, dx, dy, dw, dh);
  }

  function create(canvas, opts) {
    var img = null;
    var src = '';
    var lastBeat = 0;
    var lastHits = [];
    opts = opts || {};
    function use(next) {
      if (!canvas || !next || typeof Image === 'undefined') return;
      if (next === src && img) return;
      src = next;
      img = new Image();
      img.decoding = 'async';
      img.onload = function () { draw(canvas, img, lastBeat, lastHits); };
      img.src = next;
    }
    if (opts.src) use(opts.src);
    return {
      load: use,
      paint: function (beat, hits) {
        lastBeat = beat;
        lastHits = hits || [];
        draw(canvas, img, lastBeat, lastHits);
      },
      repaint: function () {
        draw(canvas, img, lastBeat, lastHits);
      }
    };
  }

  return {
    CELL: CELL,
    IDLE_FRAMES: IDLE_FRAMES,
    CAST_FRAMES: CAST_FRAMES,
    CAST_HIT: CAST_HIT,
    CAST_SPAN: CAST_SPAN,
    centerReached: centerReached,
    castFrameAt: castFrameAt,
    attackHits: attackHits,
    pose: pose,
    create: create
  };
});
