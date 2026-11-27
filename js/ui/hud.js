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
      var playerHpMask = el(ids.playerHpMask || 'playerHpMask');
      var playerHpVal = el(ids.playerHpVal || 'playerHpVal');
      var playerManaMask = el(ids.playerManaMask || 'playerManaMask');
      var playerManaVal = el(ids.playerManaVal || 'playerManaVal');
      var bossHpMask = el(ids.bossHpMask || 'bossHpMask');
      var bossHpVal = el(ids.bossHpVal || 'bossHpVal');
      var bossManaMask = el(ids.bossManaMask || 'bossManaMask');
      var bossManaVal = el(ids.bossManaVal || 'bossManaVal');
      var roomName = el(ids.roomName || 'roomName');
      var roomCard = el(ids.roomCard || 'roomCard');
      var roomKey = el(ids.roomKeyTag || 'roomKeyTag');
      var bpm = el(ids.bpmVal || 'bpmVal');
      var orb = el(ids.bpmOrb || 'bpmOrb');
      var beats = el(ids.beats || 'beats');

      setText(title, state.title || '');
      if (title && state.title) title.setAttribute('aria-label', state.title);
      var pHp = typeof state.playerHp === 'number' ? state.playerHp : 0;
      var pHpMax = state.playerHpMax;
      var pMana = typeof state.playerEnergy === 'number' ? state.playerEnergy : 0;
      var pManaMax = typeof state.playerEnergyMax === 'number' ? state.playerEnergyMax : 0;
      var bHp = typeof state.bossHp === 'number' ? state.bossHp : 0;
      var bHpMax = state.bossHpMax;
      var bMana = typeof state.bossEnergy === 'number' ? state.bossEnergy : 0;
      var bManaMax = typeof state.bossEnergyMax === 'number' ? state.bossEnergyMax : 0;

      function paint(mask, val, now, max, label) {
        var pct = max ? (100 * now / max) : 0;
        if (mask) {
          var miss = Math.max(0, Math.min(1, 1 - (pct / 100)));
          mask.style.width = (miss * 70) + '%';
        }
        setText(val, Math.round(now) + ' / ' + max);
        if (val) val.setAttribute('aria-label', label + ' ' + Math.round(now) + ' / ' + max);
      }

      paint(playerHpMask, playerHpVal, pHp, pHpMax, 'HP');
      paint(playerManaMask, playerManaVal, pMana, pManaMax, 'Mana');
      if (state.free) {
        paint(bossHpMask, bossHpVal, 0, 1, 'HP');
        if (bossHpMask) bossHpMask.style.width = '0%';
        var dealt = (state.damage && state.damage.total) || 0;
        setText(bossHpVal, String(dealt));
        if (bossHpVal) bossHpVal.setAttribute('aria-label', 'Daño ' + dealt);
      } else {
        paint(bossHpMask, bossHpVal, bHp, bHpMax, 'HP');
      }
      paint(bossManaMask, bossManaVal, bMana, bManaMax, 'Mana');
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
    }

    return { render: render, PHASE_LABEL: PHASE_LABEL };
  }

  return { create: create, PHASE_LABEL: PHASE_LABEL };
});
