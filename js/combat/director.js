// js/combat/director.js — setup → loop 4 Defend + 1 hole hasta KO.
// Defend = copia (Perfect/Partial/Fail). Hole = SpellEngine (ataque/buff/cura).
// Pura (reloj inyectable). UMD: module.exports + window.CombatDirector.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./chart.js'),
      require('../spell/engine.js'),
      require('../instrument/translator.js')
    );
  } else {
    root.CombatDirector = factory(root.Chart, root.SpellEngine, root.InstrumentTranslator);
  }
})(typeof self !== 'undefined' ? self : this, function (Chart, Spell, Translator) {
  'use strict';

  var VERSION = '0.1.1';

  function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function create(opts) {
    opts = opts || {};
    var chart = Chart.parse(opts.chart);
    var nowFn = opts.now || function () { return Date.now(); };
    var translator = Translator.create({
      bpm: chart.bpm,
      timeSig: chart.timeSig,
      startTimeMs: null
    });

    var playerHpMax = chart.hp.player;
    var bossHpMax = chart.hp.boss;
    var playerHp = playerHpMax;
    var bossHp = bossHpMax;
    var buffs = [];
    var running = false;
    var ended = false;
    var outcome = null;
    var lastResolve = null;
    var lastFeedback = '';
    var collected = [];
    var resolvedBar = -1;
    var freezeBeat = 0;

    function roomElement() {
      return Spell.elementForKey(chart.roomKey);
    }

    function currentBeat(t) {
      if (!running && !ended) return 0;
      if (ended) return freezeBeat;
      return translator.beatsAt(t);
    }

    function tickTo(t) {
      if (!running || ended) return snapshot(t);
      var beat = translator.beatsAt(t);
      var bpb = Chart.beatsPerBar(chart);
      var barIndex = Math.floor(beat / bpb + 1e-10);
      // Compases estrictamente anteriores al actual se cierran y se resuelven.
      while (resolvedBar < barIndex - 1) {
        resolveBar(resolvedBar + 1);
        if (ended) break;
      }
      return snapshot(t);
    }

    function resolveBar(barIndex) {
      if (barIndex < 0 || barIndex <= resolvedBar) return;
      if (ended) return;
      var meta = Chart.barAt(chart, barIndex);
      var notes = collected.filter(function (n) { return n.barIndex === barIndex; });
      var result;
      if (meta.kind === 'setup' || meta.listenOnly) {
        result = Spell.resolveSetup();
      } else if (meta.kind === 'hole') {
        result = Spell.resolveHole(notes, chart.roomKey, { buffs: buffs });
      } else {
        result = Spell.resolveDefend(notes, meta.notes, chart.roomKey, { buffs: buffs });
      }

      applyResult(result);
      lastResolve = Object.assign({ barIndex: barIndex, kind: result.kind, phase: meta.kind }, result);
      lastFeedback = feedbackText(lastResolve);
      resolvedBar = barIndex;

      decayBuffs(meta.kind);
      if (!ended && result.buff) {
        buffs.push({
          id: result.buff.id,
          label: result.buff.label,
          amount: result.buff.amount,
          remaining: result.buff.remaining
        });
      }

      if (bossHp <= 0) {
        bossHp = 0;
        finish('win', translator.beatsAt(nowFn()));
      } else if (playerHp <= 0) {
        playerHp = 0;
        finish('lose', translator.beatsAt(nowFn()));
      }
    }

    function decayBuffs(kind) {
      // ATQ+ cuenta ventanas de agujero (donde hay DPS), no copias Defend.
      if (kind !== 'hole') return;
      var next = [];
      for (var i = 0; i < buffs.length; i++) {
        var b = buffs[i];
        b.remaining -= 1;
        if (b.remaining > 0) next.push(b);
      }
      buffs = next;
    }

    function applyResult(result) {
      if (!result) return;
      if (result.bossDamage) bossHp = clamp(bossHp - result.bossDamage, 0, bossHpMax);
      if (result.heal) playerHp = clamp(playerHp + result.heal, 0, playerHpMax);
      if (result.playerDamage) playerHp = clamp(playerHp - result.playerDamage, 0, playerHpMax);
    }

    function finish(out, beat) {
      ended = true;
      running = false;
      outcome = out;
      freezeBeat = beat;
    }

    function feedbackText(r) {
      if (!r) return '';
      if (r.kind === 'setup') return 'Escucha · sin daño';
      if (r.kind === 'hole-idle') {
        if (r.extras) return 'Agujero · sin gesto';
        return 'Agujero · libre';
      }
      if (r.kind === 'defend-fail') return 'Fallo · −' + r.playerDamage + ' HP';
      if (r.kind === 'defend-partial') return 'Parcial · −' + r.playerDamage + ' HP';
      if (r.kind === 'defend-perfect') return 'Perfecto';
      if (r.kind === 'hole-spell' && r.spell) {
        var el = r.spell.element ? r.spell.element.icon : '';
        if (r.spell.action === 'attack') return 'Ataque ' + el + ' · −' + r.bossDamage + ' jefe';
        if (r.spell.action === 'heal') return 'Cura · +' + r.heal + ' HP';
        if (r.spell.action === 'buff') return 'Mejora ATQ+';
      }
      return '';
    }

    function snapshot(t) {
      t = (typeof t === 'number') ? t : nowFn();
      var beat = currentBeat(t);
      var bpb = Chart.beatsPerBar(chart);
      var barIndex = Math.floor(beat / bpb + 1e-10);
      var beatInBar = beat - barIndex * bpb;
      if (beatInBar < 0) beatInBar = 0;
      var meta = Chart.barAt(chart, barIndex);
      var phase = 'idle';
      if (ended) phase = outcome === 'win' ? 'win' : 'lose';
      else if (!running) phase = 'idle';
      else phase = meta.kind;

      var upcoming = Chart.upcoming(chart, barIndex, 4).map(function (b) {
        return {
          globalBar: b.globalBar,
          kind: b.kind,
          listenOnly: b.listenOnly,
          notes: b.notes,
          startBeat: b.startBeat
        };
      });

      return {
        version: VERSION,
        running: running,
        ended: ended,
        outcome: outcome,
        phase: phase,
        bpm: chart.bpm,
        title: chart.title,
        chartId: chart.id,
        beat: beat,
        barIndex: barIndex,
        beatInBar: beatInBar,
        beatsPerBar: bpb,
        currentBar: {
          kind: meta.kind,
          listenOnly: meta.listenOnly,
          notes: meta.notes,
          startBeat: meta.startBeat,
          loopIndex: meta.loopIndex
        },
        upcoming: upcoming,
        playerHp: playerHp,
        bossHp: bossHp,
        playerHpMax: playerHpMax,
        bossHpMax: bossHpMax,
        roomKey: chart.roomKey,
        roomElement: roomElement(),
        buffs: buffs.slice(),
        lastResolve: lastResolve,
        feedback: lastFeedback,
        metronomeBeat: Math.floor(beat + 1e-8),
        mapping: Translator.KEY_MAP,
        labels: Translator.KEY_LABELS
      };
    }

    function start(startTimeMs) {
      var t = (typeof startTimeMs === 'number') ? startTimeMs : nowFn();
      playerHp = playerHpMax;
      bossHp = bossHpMax;
      buffs = [];
      collected = [];
      resolvedBar = -1;
      lastResolve = null;
      lastFeedback = '';
      ended = false;
      outcome = null;
      freezeBeat = 0;
      running = true;
      translator.setBpm(chart.bpm);
      translator.setTimeSig(chart.timeSig);
      translator.setStart(t);
      return snapshot(t);
    }

    function reset() {
      running = false;
      ended = false;
      outcome = null;
      playerHp = playerHpMax;
      bossHp = bossHpMax;
      buffs = [];
      collected = [];
      resolvedBar = -1;
      lastResolve = null;
      lastFeedback = '';
      freezeBeat = 0;
      translator.setStart(null);
      return snapshot(0);
    }

    function noteOn(pitch, timeMs) {
      var t = (typeof timeMs === 'number') ? timeMs : nowFn();
      tickTo(t);
      var ev = translator.noteOn(pitch, t);
      if (running && !ended && ev.pitch) {
        collected.push({
          pitch: ev.pitch,
          midi: ev.midi,
          timeMs: t,
          beat: ev.beat,
          beatInBar: ev.beatInBar,
          barIndex: ev.barIndex
        });
      }
      return ev;
    }

    function noteOff(pitch, timeMs) {
      var t = (typeof timeMs === 'number') ? timeMs : nowFn();
      return translator.noteOff(pitch, t);
    }

    return {
      VERSION: VERSION,
      chart: chart,
      start: start,
      reset: reset,
      tick: tickTo,
      noteOn: noteOn,
      noteOff: noteOff,
      snapshot: snapshot,
      translator: translator
    };
  }

  return {
    VERSION: VERSION,
    create: create
  };
});
