// js/ui/hud.js — HP 15/20, sala, BPM, feedback, buffs. Cromo del mockup.
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
    hole: 'Ataque',
    win: 'Victoria',
    lose: 'Derrota'
  };

  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M6 14.5 12 7l6 7.5"/></svg>';

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
      var playerMask = el(ids.playerHpMask || 'playerHpMask');
      var bossMask = el(ids.bossHpMask || 'bossHpMask');
      var playerVal = el(ids.playerHpVal || 'playerHpVal');
      var bossVal = el(ids.bossHpVal || 'bossHpVal');
      var roomName = el(ids.roomName || 'roomName');
      var roomCard = el(ids.roomCard || 'roomCard');
      var roomKey = el(ids.roomKeyTag || 'roomKeyTag');
      var roomIcon = el(ids.roomIcon || 'roomIcon');
      var roomEmoji = el(ids.roomEmoji || 'roomEmoji');
      var bpm = el(ids.bpmVal || 'bpmVal');
      var orb = el(ids.bpmOrb || 'bpmOrb');
      var beats = el(ids.beats || 'beats');
      var buffs = el(ids.buffs || 'buffs');

      setText(title, state.title || '');
      if (title && state.title) title.setAttribute('aria-label', state.title);
      var pPct = state.playerHpMax ? (100 * state.playerHp / state.playerHpMax) : 0;
      var bPct = state.bossHpMax ? (100 * state.bossHp / state.bossHpMax) : 0;
      if (playerMask) {
        var pMiss = Math.max(0, Math.min(1, 1 - (pPct / 100)));
        playerMask.style.width = (pMiss * 70) + '%';
      }
      if (bossMask) {
        var miss = Math.max(0, Math.min(1, 1 - (bPct / 100)));
        bossMask.style.width = (miss * 70) + '%';
      }
      setText(playerVal, state.playerHp + ' / ' + state.playerHpMax);
      if (playerVal) playerVal.setAttribute('aria-label', 'HP ' + state.playerHp + ' / ' + state.playerHpMax);
      if (state.free) {
        var dealt = (state.damage && state.damage.total) || 0;
        setText(bossVal, String(dealt));
        if (bossVal) bossVal.setAttribute('aria-label', 'Daño ' + dealt);
      } else {
        setText(bossVal, state.bossHp + ' / ' + state.bossHpMax);
        if (bossVal) bossVal.setAttribute('aria-label', 'HP ' + state.bossHp + ' / ' + state.bossHpMax);
      }
      if (bossMask && state.free) bossMask.style.width = '0%';
      var stats = el(ids.dmgStats || 'dmgStats');
      if (stats) {
        stats.hidden = !state.free;
        if (state.free) {
          var d = state.damage || {};
          setText(stats, (d.total || 0) + ' · ' + (d.hits || 0) + ' · ' + (d.max || 0) + ' · ' + (d.dps || 0));
          stats.setAttribute('aria-label', 'Total ' + (d.total || 0) + ' · Golpes ' + (d.hits || 0) +
            ' · Máx ' + (d.max || 0) + ' · DPS ' + (d.dps || 0));
        }
      }

      var re = state.roomElement || {};
      setText(roomName, re.label || '');
      if (roomCard) roomCard.setAttribute('aria-label', re.label || '');
      setText(roomKey, state.roomKey || 'C');
      var agua = (re.id || 'agua') === 'agua';
      if (roomIcon) roomIcon.hidden = !agua;
      if (roomEmoji) {
        roomEmoji.hidden = agua;
        if (!agua) roomEmoji.textContent = re.icon || '';
      }

      setText(bpm, String(state.bpm));
      if (orb) {
        var center = (typeof Chart !== 'undefined' && typeof Chart.BEAT_CENTER === 'number')
          ? Chart.BEAT_CENTER
          : 0.5;
        var frac = (state.beat || 0) - Math.floor(state.beat || 0);
        var pulsing = !!(state.running && !state.paused && frac >= center && frac < center + 0.18);
        orb.classList.toggle('pulse', pulsing);
      }

      if (beats) {
        var dots = beats.querySelectorAll('i');
        var beatIn = Math.floor(state.beatInBar || 0) % (state.beatsPerBar || 4);
        var beatFrac = (state.beat || 0) - Math.floor(state.beat || 0);
        var beatCenter = (typeof Chart !== 'undefined' && typeof Chart.BEAT_CENTER === 'number')
          ? Chart.BEAT_CENTER
          : 0.5;
        var pulse = beatFrac >= beatCenter && beatFrac < beatCenter + 0.18;
        for (var i = 0; i < dots.length; i++) {
          dots[i].className = '';
          if (state.running && i === beatIn) dots[i].className = pulse ? 'on pulse' : 'on';
        }
      }

      if (buffs) {
        var list = state.buffs || [];
        var sig = list.map(function (b) {
          return (b.id || '') + ':' + b.remaining;
        }).join('|');
        if (buffs.getAttribute('data-sig') !== sig) {
          buffs.setAttribute('data-sig', sig);
          buffs.textContent = '';
          for (var bi = 0; bi < list.length; bi++) {
            var b = list[bi];
            var chip = document.createElement('div');
            chip.className = 'chip live minor';
            chip.setAttribute('aria-label', (b.label || 'Mejora') + ' ' + b.remaining);
            chip.innerHTML = CHEVRON + '<span class="n">' + b.remaining + '</span>';
            buffs.appendChild(chip);
          }
        }
      }

    }

    return { render: render, PHASE_LABEL: PHASE_LABEL };
  }

  return { create: create, PHASE_LABEL: PHASE_LABEL };
});
