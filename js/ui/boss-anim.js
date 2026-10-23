// js/ui/boss-anim.js — spritesheet sobre el reloj del combate.
// Idle: el cuadro 0 abre el compás. Cast: el cuadro pico empieza en el golpe.
// Al terminar el cast vuelve el idle.
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

  var BEAT_CENTER = 0.5;

  function compile(raw) {
    var cell;
    var anchor;
    var idle;
    var cast;
    var i;
    var lead;
    var refBpm;
    var idleMs;
    var idleBeats;
    if (!raw || typeof raw !== 'object') throw new Error('timings');
    cell = raw.cell;
    anchor = raw.anchor;
    idle = raw.idle;
    cast = raw.cast;
    if (!cell || cell.length < 2 || !(cell[0] > 0) || !(cell[1] > 0)) throw new Error('cell');
    if (!anchor || typeof anchor.x !== 'number' || typeof anchor.y !== 'number') throw new Error('anchor');
    if (!idle) throw new Error('idle');
    if (!cast || !cast.frameMs || !cast.frameMs.length) throw new Error('cast');
    if (typeof cast.peakFrame !== 'number' || cast.peakFrame < 0 || cast.peakFrame >= cast.frameMs.length) {
      throw new Error('peak');
    }
    refBpm = raw.refBpm > 0 ? raw.refBpm : 72;
    lead = 0;
    for (i = 0; i < cast.frameMs.length; i++) {
      if (!(cast.frameMs[i] > 0)) throw new Error('frameMs');
    }
    for (i = 0; i < cast.peakFrame; i++) lead += cast.frameMs[i];
    if (typeof cast.peakOffsetMs === 'number' && Math.abs(lead - cast.peakOffsetMs) > 1) {
      throw new Error('peakOffset');
    }
    idleMs = idle.frameMs && idle.frameMs.length ? idle.frameMs : null;
    idleBeats = null;
    if (idleMs) {
      if (idle.frames && idle.frames !== idleMs.length) throw new Error('idle');
      idleBeats = [];
      for (i = 0; i < idleMs.length; i++) {
        if (!(idleMs[i] > 0)) throw new Error('idleMs');
        idleBeats.push(msToBeats(idleMs[i], refBpm));
      }
    } else if (!(idle.frames > 0)) {
      throw new Error('idle');
    }
    return {
      cell: [cell[0], cell[1]],
      anchor: { x: anchor.x, y: anchor.y },
      refBpm: refBpm,
      idle: {
        row: idle.row || 0,
        frames: idleMs ? idleMs.length : idle.frames,
        frameBeats: idle.frameBeats > 0 ? idle.frameBeats : 1,
        frameMs: idleMs ? idleMs.slice() : null,
        frameBeatsList: idleBeats
      },
      cast: {
        row: cast.row || 0,
        frameMs: cast.frameMs.slice(),
        peakFrame: cast.peakFrame,
        peakOffsetMs: lead
      }
    };
  }

  function msToBeats(ms, refBpm) {
    return ms * refBpm / 60000;
  }

  function idleFrameMs(bpm, frameBeats) {
    var beats = frameBeats > 0 ? frameBeats : 1;
    return beats * 60000 / bpm;
  }

  function scaleMs(src, spec, bpm) {
    var k = spec.refBpm / bpm;
    var out = [];
    var i;
    for (i = 0; i < src.length; i++) out.push(src[i] * k);
    return out;
  }

  function scaledFrameMs(spec, bpm) {
    return scaleMs(spec.cast.frameMs, spec, bpm);
  }

  function scaledIdleFrameMs(spec, bpm) {
    var src = spec.idle.frameMs;
    var out;
    var i;
    var ms;
    if (src) return scaleMs(src, spec, bpm);
    ms = idleFrameMs(bpm, spec.idle.frameBeats);
    out = [];
    for (i = 0; i < spec.idle.frames; i++) out.push(ms);
    return out;
  }

  function peakOffsetMs(spec, bpm) {
    return spec.cast.peakOffsetMs * spec.refBpm / bpm;
  }

  function peakLeadBeats(spec) {
    return msToBeats(spec.cast.peakOffsetMs, spec.refBpm);
  }

  function castSpanBeats(spec) {
    var ms = 0;
    var i;
    var frames = spec.cast.frameMs;
    for (i = 0; i < frames.length; i++) ms += frames[i];
    return msToBeats(ms, spec.refBpm);
  }

  // Inicios de cuadro dentro del compás. Las duraciones en ms llenan el compás.
  function idleStarts(spec, beatsPerBar) {
    var list = spec.idle.frameBeatsList;
    var sum;
    var bpb;
    var acc;
    var i;
    var out;
    if (!list) return null;
    sum = 0;
    for (i = 0; i < list.length; i++) sum += list[i];
    bpb = (typeof beatsPerBar === 'number' && beatsPerBar > 0) ? beatsPerBar : sum;
    out = [];
    acc = 0;
    for (i = 0; i < list.length; i++) {
      out.push(acc);
      acc += list[i] * (bpb / sum);
    }
    return out;
  }

  function idleIndex(beat, spec, beatsPerBar) {
    var starts;
    var bpb;
    var inBar;
    var eps;
    var i;
    if (!spec.idle.frameBeatsList) {
      return idleFrame(beat, spec.idle.frames, beatsPerBar, spec.idle.frameBeats);
    }
    if (typeof beat !== 'number' || !isFinite(beat)) return 0;
    starts = idleStarts(spec, beatsPerBar);
    bpb = (typeof beatsPerBar === 'number' && beatsPerBar > 0) ? beatsPerBar : 0;
    if (!(bpb > 0) && starts.length) {
      bpb = starts[starts.length - 1] + spec.idle.frameBeatsList[starts.length - 1];
    }
    inBar = beat % bpb;
    if (inBar < 0) inBar += bpb;
    // Un milisegundo: los enteros del compás caen en el pulso.
    eps = msToBeats(1, spec.refBpm);
    for (i = 0; i < starts.length - 1; i++) {
      if (inBar < starts[i + 1] - eps) return i;
    }
    return starts.length - 1;
  }

  function idleFrame(beat, frames, beatsPerBar, frameBeats) {
    var bpb;
    var step;
    var inBar;
    var f;
    if (typeof beat !== 'number' || !isFinite(beat)) return 0;
    step = frameBeats > 0 ? frameBeats : 1;
    bpb = (typeof beatsPerBar === 'number' && beatsPerBar > 0) ? beatsPerBar : frames * step;
    inBar = beat % bpb;
    if (inBar < 0) inBar += bpb;
    f = Math.floor(inBar / step + 1e-9);
    if (f < 0) f = 0;
    if (frames > 0) f = f % frames;
    return f;
  }

  // Cuadro del cast si `beat` cae en la ventana de ese golpe; −1 si no.
  // El cuadro pico empieza en `hit`.
  function castFrameAt(beat, hit, spec) {
    var beats;
    var start;
    var t;
    var acc;
    var i;
    if (!spec || typeof beat !== 'number' || typeof hit !== 'number') return -1;
    if (!isFinite(beat) || !isFinite(hit)) return -1;
    beats = [];
    for (i = 0; i < spec.cast.frameMs.length; i++) {
      beats.push(msToBeats(spec.cast.frameMs[i], spec.refBpm));
    }
    start = hit - peakLeadBeats(spec);
    t = beat - start;
    if (t < -1e-9) return -1;
    acc = 0;
    for (i = 0; i < beats.length; i++) {
      acc += beats[i];
      if (t < acc - 1e-9) return i;
    }
    return -1;
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

  function pose(beat, hits, spec, beatsPerBar) {
    var best = -1;
    var bestDist = Infinity;
    var i;
    var frame;
    var dist;
    hits = hits || [];
    for (i = 0; i < hits.length; i++) {
      frame = castFrameAt(beat, hits[i], spec);
      if (frame < 0) continue;
      dist = Math.abs(beat - hits[i]);
      if (dist < bestDist) {
        bestDist = dist;
        best = frame;
      }
    }
    if (best >= 0) return { row: spec.cast.row, frame: best, state: 'cast' };
    return {
      row: spec.idle.row,
      frame: idleIndex(beat, spec, beatsPerBar),
      state: 'idle'
    };
  }

  // El ancla de la celda cae siempre en el mismo punto del canvas.
  function place(destW, destH, spec) {
    var cellW = spec.cell[0];
    var cellH = spec.cell[1];
    var scale = Math.min(destW / cellW, destH / cellH);
    var anchorDestX = destW / 2;
    var anchorDestY = destH - (cellH - spec.anchor.y) * scale;
    return {
      scale: scale,
      dx: anchorDestX - spec.anchor.x * scale,
      dy: anchorDestY - spec.anchor.y * scale,
      dw: cellW * scale,
      dh: cellH * scale,
      anchorDestX: anchorDestX,
      anchorDestY: anchorDestY
    };
  }

  function draw(canvas, img, spec, p) {
    var cssW;
    var cssH;
    var dpr;
    var bw;
    var bh;
    var ctx;
    var rect;
    if (!canvas || !img || !img.complete || !img.naturalWidth || !spec || !p) return;
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
    ctx.imageSmoothingEnabled = false;
    rect = place(bw, bh, spec);
    ctx.drawImage(
      img,
      p.frame * spec.cell[0],
      p.row * spec.cell[1],
      spec.cell[0],
      spec.cell[1],
      rect.dx,
      rect.dy,
      rect.dw,
      rect.dh
    );
  }

  function create(canvas, hooks) {
    var img = null;
    var spec = null;
    var src = '';
    var token = 0;
    var lastBeat = 0;
    var lastHits = [];
    var lastBpb = 4;
    var lastPose = null;
    hooks = hooks || {};
    if (canvas && canvas.style) canvas.style.imageRendering = 'pixelated';

    function fail() {
      img = null;
      spec = null;
      lastPose = null;
      if (hooks.onError) hooks.onError();
    }

    function drawNow() {
      lastPose = spec ? pose(lastBeat, lastHits, spec, lastBpb) : null;
      draw(canvas, img, spec, lastPose);
    }

    function useSheet(next, compiled, my) {
      spec = compiled;
      if (next === src && img && img.complete && img.naturalWidth) {
        if (my !== token) return;
        drawNow();
        if (hooks.onReady) hooks.onReady();
        return;
      }
      src = next;
      img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        if (my !== token) return;
        if (!img.naturalWidth) {
          fail();
          return;
        }
        drawNow();
        if (hooks.onReady) hooks.onReady();
      };
      img.onerror = function () {
        if (my !== token) return;
        fail();
      };
      img.src = next;
    }

    function load(next, timings) {
      var my = ++token;
      if (!canvas || typeof Image === 'undefined' || !next) {
        fail();
        return;
      }
      function withSpec(parsed) {
        var compiled;
        if (my !== token) return;
        try {
          compiled = compile(parsed);
        } catch (e) {
          fail();
          return;
        }
        useSheet(next, compiled, my);
      }
      if (typeof timings === 'string') {
        fetch(timings).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(withSpec).catch(function () {
          if (my !== token) return;
          fail();
        });
      } else if (timings) {
        withSpec(timings);
      } else {
        fail();
      }
    }

    function cancel() {
      token += 1;
      img = null;
      spec = null;
      lastPose = null;
    }

    return {
      load: load,
      cancel: cancel,
      paint: function (beat, hits, beatsPerBar) {
        lastBeat = beat;
        lastHits = hits || [];
        if (typeof beatsPerBar === 'number' && beatsPerBar > 0) lastBpb = beatsPerBar;
        drawNow();
      },
      repaint: function () {
        drawNow();
      },
      current: function () {
        return lastPose;
      }
    };
  }

  return {
    BEAT_CENTER: BEAT_CENTER,
    compile: compile,
    idleFrameMs: idleFrameMs,
    scaledFrameMs: scaledFrameMs,
    scaledIdleFrameMs: scaledIdleFrameMs,
    idleStarts: idleStarts,
    peakOffsetMs: peakOffsetMs,
    peakLeadBeats: peakLeadBeats,
    castSpanBeats: castSpanBeats,
    idleFrame: idleFrame,
    castFrameAt: castFrameAt,
    attackHits: attackHits,
    pose: pose,
    place: place,
    create: create
  };
});
