// js/ui/tutorial.js — tutorial de primera visita (spotlight, Siguiente / Saltar).
// localStorage seenTutorial. Sin CDN.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Tutorial = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'seenTutorial';

  var STEPS = [
    {
      id: 'sala',
      selector: '#stageTop',
      title: 'Sala y tempo',
      body: 'La sala fija el elemento y el tempo.'
    },
    {
      id: 'cinta',
      selector: '#tapeFrame',
      title: 'Cinta',
      body: 'Las notas pasan por la línea; toca a tiempo.'
    },
    {
      id: 'hueco',
      selector: '#tapeFrame',
      title: 'Hueco',
      body: 'Improvisas: mayor=ataque, menor=buff, pentatónica=cura.'
    },
    {
      id: 'defend',
      selector: '#tapeFrame',
      title: 'Defiende',
      body: 'Copia las notas para no recibir daño.'
    },
    {
      id: 'teclado',
      selector: '#keys',
      title: 'Teclado en pantalla',
      body: 'Úsalo en el celular sin piano.',
      showKeyboard: true
    }
  ];

  function readSeen() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v === '1' || v === 'true') return true;
      // No hay saves de partida en M0. Si más adelante existe un save viejo
      // sin esta clave, no forzar el tutorial a quien ya jugó.
      if (v == null && localStorage.getItem('pmSave')) return true;
    } catch (e) {
      return false;
    }
    return false;
  }

  function markSeen() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function create(opts) {
    opts = opts || {};
    var rootEl = opts.root || (typeof document !== 'undefined' ? document.getElementById('tutorial') : null);
    var index = 0;
    var open = false;

    function el(id) {
      return rootEl ? rootEl.querySelector('#' + id) : null;
    }

    function place(step) {
      if (!rootEl || !step) return;
      var target = document.querySelector(step.selector);
      var spot = el('tutSpot');
      var card = el('tutCard');
      if (!target || !spot || !card) return;
      var r = target.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      var pad = 6;
      spot.style.top = (r.top - pad) + 'px';
      spot.style.left = (r.left - pad) + 'px';
      spot.style.width = (r.width + pad * 2) + 'px';
      spot.style.height = (r.height + pad * 2) + 'px';
      var cardH = card.offsetHeight || 150;
      var top = r.bottom + 12;
      if (top + cardH > window.innerHeight - 8) {
        top = r.top - cardH - 12;
      }
      if (top < 8) top = 8;
      card.style.top = top + 'px';
    }

    function placeSoon(step) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          place(step);
          requestAnimationFrame(function () { place(step); });
        });
      } else {
        place(step);
      }
      setTimeout(function () { if (open) place(STEPS[index]); }, 70);
    }

    function paint(step) {
      var title = el('tutTitle');
      var text = el('tutText');
      var progress = el('tutProgress');
      var next = el('tutNext');
      if (title) title.textContent = step.title;
      if (text) text.textContent = step.body;
      if (progress) progress.textContent = (index + 1) + ' / ' + STEPS.length;
      if (next) next.textContent = index === STEPS.length - 1 ? 'Listo' : 'Siguiente';
    }

    function go(i) {
      index = i;
      var step = STEPS[i];
      if (!step) return;
      if (opts.onStep) opts.onStep(step, i);
      paint(step);
      placeSoon(step);
    }

    function close() {
      open = false;
      if (rootEl) rootEl.hidden = true;
      if (opts.onClose) opts.onClose();
    }

    function finish() {
      markSeen();
      close();
    }

    function openAt(i) {
      if (!rootEl) return;
      open = true;
      rootEl.hidden = false;
      go(i);
      var next = el('tutNext');
      if (next && next.focus) {
        try { next.focus({ preventScroll: true }); } catch (e) { next.focus(); }
      }
    }

    function next() {
      if (!open) return;
      if (index >= STEPS.length - 1) finish();
      else go(index + 1);
    }

    function skip() {
      if (!open) return;
      finish();
    }

    function maybeStart() {
      if (readSeen()) return false;
      openAt(0);
      return true;
    }

    function replay() {
      openAt(0);
    }

    function onResize() {
      if (open) place(STEPS[index]);
    }

    if (typeof document !== 'undefined') {
      var nextBtn = el('tutNext');
      var skipBtn = el('tutSkip');
      if (nextBtn) nextBtn.addEventListener('click', next);
      if (skipBtn) skipBtn.addEventListener('click', skip);
      window.addEventListener('resize', onResize);
      document.addEventListener('keydown', function (ev) {
        if (!open) return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          skip();
        }
      });
    }

    return {
      maybeStart: maybeStart,
      replay: replay,
      next: next,
      skip: skip,
      isOpen: function () { return open; },
      stepIndex: function () { return index; },
      steps: STEPS
    };
  }

  return {
    create: create,
    STORAGE_KEY: STORAGE_KEY,
    STEPS: STEPS,
    readSeen: readSeen
  };
});
