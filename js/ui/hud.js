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
    hole: 'Agujero',
    win: 'Victoria',
    lose: 'Derrota'
  };

  var BUFF_ICON = {
    atk: 'assets/ui/buff-icon-2.png?v=0.1.2'
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
      var bossMask = el(ids.bossHpMask || 'bossHpMask');
      var playerVal = el(ids.playerHpVal || 'playerHpVal');
      var bossVal = el(ids.bossHpVal || 'bossHpVal');
      var roomName = el(ids.roomName || 'roomName');
      var roomKey = el(ids.roomKeyTag || 'roomKeyTag');
      var roomIcon = el(ids.roomIcon || 'roomIcon');
      var roomEmoji = el(ids.roomEmoji || 'roomEmoji');
      var bpm = el(ids.bpmVal || 'bpmVal');
      var orb = el(ids.bpmOrb || 'bpmOrb');
      var phase = el(ids.phaseBadge || 'phaseBadge');
      var beats = el(ids.beats || 'beats');
      var buffs = el(ids.buffs || 'buffs');
      var feedback = el(ids.feedback || 'feedback');

      setText(title, state.title || '');
      var pPct = state.playerHpMax ? (100 * state.playerHp / state.playerHpMax) : 0;
      var bPct = state.bossHpMax ? (100 * state.bossHp / state.bossHpMax) : 0;
      if (playerBar) playerBar.style.width = Math.max(0, Math.min(100, pPct)) + '%';
      if (bossMask) {
        var miss = Math.max(0, Math.min(1, 1 - (bPct / 100)));
        bossMask.style.width = (miss * 70) + '%';
      }
      setText(playerVal, state.playerHp + ' / ' + state.playerHpMax);
      setText(bossVal, state.bossHp + ' / ' + state.bossHpMax);

      var re = state.roomElement || {};
      setText(roomName, re.label || '');
      setText(roomKey, state.roomKey || 'C');
      var agua = (re.id || 'agua') === 'agua';
      if (roomIcon) roomIcon.hidden = !agua;
      if (roomEmoji) {
        roomEmoji.hidden = agua;
        if (!agua) roomEmoji.textContent = re.icon || '';
      }

      setText(bpm, String(state.bpm));
      if (orb) {
        var pulsing = !!(state.running && (state.beat % 1) < 0.18);
        orb.classList.toggle('pulse', pulsing);
      }

      var ph = state.phase || 'idle';
      setText(phase, PHASE_LABEL[ph] || ph);
      if (phase) phase.className = ph;

      if (beats) {
        var dots = beats.querySelectorAll('i');
        var beatIn = Math.floor(state.beatInBar || 0) % (state.beatsPerBar || 4);
        var pulse = (state.beat % 1) < 0.18;
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
            chip.className = 'chip live';
            var img = document.createElement('img');
            img.src = BUFF_ICON[b.id] || BUFF_ICON.atk;
            img.alt = '';
            var span = document.createElement('span');
            span.textContent = (b.label || b.id) + ' · ' + b.remaining;
            chip.appendChild(img);
            chip.appendChild(span);
            buffs.appendChild(chip);
          }
        }
      }

      if (feedback) {
        var reIdle = state.roomElement || {};
        var idleMsg = 'Sala en ' + (state.roomKey || 'C') + ' · ' + (reIdle.label || 'Agua') + ' · drone C / toca libre en el setup';
        feedback.textContent = state.feedback || (state.running ? '' : idleMsg);
        feedback.className = '';
        if (state.lastResolve) {
          if (state.lastResolve.kind === 'setup') feedback.className = 'setup';
          if (state.lastResolve.kind === 'defend-partial') feedback.className = 'partial';
          if (!state.lastResolve.ok) feedback.className = 'miss';
        }
      }

      var hint = el(ids.hint || 'hint');
      if (hint) {
        if (state.phase === 'hole') {
          hint.textContent = 'Agujero: improvisa · mayor (C D E) = ataque · menor (C Eb G) = mejora · pentatónica (C D E G A) = cura. Tocar no resta HP.';
        } else if (state.phase === 'defend') {
          hint.textContent = 'Defiende: copia la cinta. A = C4 · S = D4 · D = E4. Perfecto / Parcial / Fallo — sin DPS al jefe.';
        } else {
          hint.textContent = 'Tras la escucha: agujero (improvisa) y luego 4 Defiende. A S D = C4 D4 E4. Agujero: F G H J K + W E T Y U. Sala C = Agua.';
        }
      }
    }

    return { render: render, PHASE_LABEL: PHASE_LABEL };
  }

  return { create: create, PHASE_LABEL: PHASE_LABEL };
});
