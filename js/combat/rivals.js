// js/combat/rivals.js — rivales elegibles y Modo libre (v0.1.9).
// Pura, sin DOM. UMD: module.exports + window.Rivals.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rivals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREE_ID = 'libre';
  var FREE_HP = 999999;

  // Solo los rivales con chart en charts/. Para sumar otro: un JSON más aquí.
  var LIST = [
    { id: 'raindrops-thunder', label: 'Raindrops, Thunder', chart: 'charts/raindrops-thunder.json' },
    // Grimorio Unidad 2 · Cámara del Rocío (piano-magic-grimoire-unit2.docx + *.ly).
    { id: 'parade-feather', label: 'Parade Feather', chart: 'charts/parade-feather.json', grimoire: true },
    { id: 'veil-boat', label: 'The Veil Boat', chart: 'charts/veil-boat.json', grimoire: true },
    { id: 'tower-chime', label: 'Tower Chime', chart: 'charts/tower-chime.json', grimoire: true },
    // PROVISIONALES (progresión Faber), fáciles de quitar: borrar estas dos líneas.
    { id: 'bosque-de-sol', label: 'Guardián del Bosque de Sol', chart: 'charts/bosque-de-sol.json' },
    { id: 'torre-de-escalas', label: 'Hechicera de la Torre', chart: 'charts/torre-de-escalas.json' }
  ];

  function options() {
    return LIST.map(function (r) {
      return { id: r.id, label: r.label, chart: r.chart, free: false };
    }).concat([{ id: FREE_ID, label: 'Modo libre', chart: LIST[0].chart, free: true }]);
  }

  function find(id) {
    var all = options();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return all[0];
  }

  // Modo libre: usa el chart del rival 1 (sala C, escala de Do mayor). Misma sala/BPM del chart base, pero el loop es solo Ataque
  // (sin Defiende ni golpes del jefe) y el jefe no cae.
  function freeChart(base) {
    var c = JSON.parse(JSON.stringify(base));
    c.id = FREE_ID;
    c.title = 'Modo libre';
    c.loop = [{ i: 0, kind: 'hole', notes: [] }];
    c.hp = { player: (base.hp && base.hp.player) || 15, boss: FREE_HP };
    return c;
  }

  return { FREE_ID: FREE_ID, FREE_HP: FREE_HP, LIST: LIST, options: options, find: find, freeChart: freeChart };
});
