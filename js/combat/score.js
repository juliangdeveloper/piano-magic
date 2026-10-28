'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chart.js'));
  else root.Score = factory(root.Chart);
})(typeof self !== 'undefined' ? self : this, function (Chart) {
  'use strict';

  var TEMPOS = [
    { id: 'real', factor: 1, label: 'Tempo real' },
    { id: 'ease', factor: 0.75, label: 'Un poco más lento' },
    { id: 'slow', factor: 0.5, label: 'Bien lento' }
  ];

  function tempoById(id) {
    var i;
    for (i = 0; i < TEMPOS.length; i++) if (TEMPOS[i].id === id) return TEMPOS[i];
    return TEMPOS[0];
  }

  function bpmFor(bpm, factor) {
    var base = (typeof bpm === 'number' && bpm > 0) ? bpm : 60;
    var f = (typeof factor === 'number' && factor > 0) ? factor : 1;
    var n = Math.round(base * f);
    if (n < 1) n = 1;
    return n;
  }

  function sections(loop) {
    var out = [];
    var start = 0;
    var i;
    if (!loop || !loop.length) return out;
    for (i = 0; i < loop.length; i++) {
      if (loop[i] && loop[i].kind === 'hole' && i > start) {
        out.push({ from: start, to: i });
        start = i;
      }
    }
    out.push({ from: start, to: loop.length });
    return out;
  }

  function clampSection(loop, section) {
    var n = loop ? loop.length : 0;
    var from = section && typeof section.from === 'number' ? section.from : 0;
    var to = section && typeof section.to === 'number' ? section.to : n;
    if (from < 0) from = 0;
    if (to > n) to = n;
    from = from | 0;
    to = to | 0;
    if (to <= from) {
      from = 0;
      to = n;
    }
    return { from: from, to: to };
  }

  function loopNotes(raw, section) {
    var chart = Chart.parse(raw);
    var sec = clampSection(chart.loop, section);
    var bpb = Chart.beatsPerBar(chart);
    var notes = [];
    var i;
    var j;
    var bar;
    var n;
    for (i = sec.from; i < sec.to; i++) {
      bar = chart.loop[i];
      for (j = 0; j < bar.notes.length; j++) {
        n = bar.notes[j];
        notes.push({
          pitch: n.pitch,
          hand: n.hand,
          dur: n.dur,
          onset: (i - sec.from) * bpb + n.beat + Chart.BEAT_CENTER
        });
      }
    }
    return {
      notes: notes,
      beats: (sec.to - sec.from) * bpb,
      bpb: bpb,
      bpm: chart.bpm,
      from: sec.from,
      to: sec.to
    };
  }

  function sheetModel(raw, section, beat) {
    var chart = Chart.parse(raw);
    var sec = clampSection(chart.loop, section);
    var bpb = Chart.beatsPerBar(chart);
    var bars = [];
    var i;
    var bar;
    var model;
    for (i = 0; i < chart.loop.length; i++) {
      bar = chart.loop[i];
      bars.push({
        index: i,
        kind: bar.kind,
        notes: bar.notes,
        startBeat: i * bpb,
        globalBar: i,
        listenOnly: false
      });
    }
    model = { bars: bars, bpb: bpb, bpm: chart.bpm, from: sec.from, to: sec.to };
    if (typeof beat === 'number' && isFinite(beat)) model.beat = beat;
    return model;
  }

  function practiceChart(raw, section, tempoId) {
    var chart = Chart.parse(raw);
    var sec = clampSection(chart.loop, section);
    var tempo = tempoById(tempoId);
    var copy = JSON.parse(JSON.stringify(raw));
    copy.loop = copy.loop.slice(sec.from, sec.to).map(function (bar, i) {
      bar.i = i;
      return bar;
    });
    if (!copy.loop.length) copy.loop = [{ i: 0, kind: 'hole', notes: [] }];
    copy.bpm = bpmFor(chart.bpm, tempo.factor);
    copy.setup = { listenOnly: true, bars: 0 };
    return copy;
  }

  return {
    TEMPOS: TEMPOS,
    tempoById: tempoById,
    bpmFor: bpmFor,
    sections: sections,
    loopNotes: loopNotes,
    sheetModel: sheetModel,
    practiceChart: practiceChart
  };
});
