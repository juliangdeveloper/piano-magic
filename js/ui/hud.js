// js/ui/hud.js — HP, sala, BPM/metrónomo, feedback, buffs.
// UMD: module.exports + window.Hud.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Hud = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PHASE_LABEL = {
    idle: 'Listo',
    setup: 'Escucha',
    defend: 'Defiende',
    hole: 'Agujero',
    win: 'Victoria',
    lose: 'Derrota'
  };

  function el(id) {
    return (typeof document === 'undefined') ? null : document.getElementById(id);
  }

  function create(ids) {
    ids = ids || {};

    function setText(node, text) {
      if (node) node.textContent = text;
    }

    function render(state) {
      if (!state) return;
      var title = el(ids.songTitle || 'songTitle');
      var playerBar = el(ids.playerHpBar || 'playerHpBar');
      var bossBar = el(ids.bossHpBar || 'bossHpBar');
      var playerVal = el(ids.playerHpVal || 'playerHpVal');
      var bossVal = el(ids.bossHpVal || 'bossHpVal');
      var room = el(ids.roomBadge || 'roomBadge');
      var bpm = el(ids.bpmBadge || 'bpmBadge');
      var phase = el(ids.phaseBadge || 'phaseBadge');
      var beats = el(ids.beats || 'beats');
      var buffs = el(ids.buffs || 'buffs');
      var feedback = el(ids.feedback || 'feedback');

      setText(title, state.title || '');
      var pPct = state.playerHpMax ? (100 * state.playerHp / state.playerHpMax) : 0;
      var bPct = state.bossHpMax ? (100 * state.bossHp / state.bossHpMax) : 0;
      if (playerBar) playerBar.style.width = Math.max(0, pPct) + '%';
      if (bossBar) bossBar.style.width = Math.max(0, bPct) + '%';
      setText(playerVal, String(state.playerHp));
      setText(bossVal, String(state.bossHp));

      var re = state.roomElement || {};
      setText(room, (re.icon || '') + ' ' + (state.roomKey || 'C') + ' · ' + (re.label || ''));
      setText(bpm, '♩=' + state.bpm);

      var ph = state.phase || 'idle';
      setText(phase, PHASE_LABEL[ph] || ph);
      if (phase) phase.className = ph;

      if (beats) {
        var dots = beats.querySelectorAll('i');
        var beatIn = Math.floor(state.beatInBar || 0) % (state.beatsPerBar || 4);
        var pulse = (state.beat % 1) < 0.18;
        for (var i = 0; i < dots.length; i++) {
          dots[i].className = '';
          if (i === beatIn) dots[i].className = pulse ? 'on pulse' : 'on';
        }
      }

      if (buffs) {
        if (!state.buffs || !state.buffs.length) {
          buffs.textContent = '';
        } else {
          buffs.textContent = state.buffs.map(function (b) {
            return (b.label || b.id) + ' (' + b.remaining + ')';
          }).join(' · ');
        }
      }

      if (feedback) {
        feedback.textContent = state.feedback || (state.running ? '' : 'Sala en C · drone C / toca libre en el setup');
        feedback.className = '';
        if (state.lastResolve) {
          if (state.lastResolve.kind === 'setup') feedback.className = 'setup';
          if (!state.lastResolve.ok) feedback.className = 'miss';
        }
      }
    }

    return { render: render, PHASE_LABEL: PHASE_LABEL };
  }

  return { create: create, PHASE_LABEL: PHASE_LABEL };
});
