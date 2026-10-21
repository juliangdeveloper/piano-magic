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

  // Cada rival: chart en charts/. sprite (sheet 1152×384, celdas 192) lo anima;
  // sin sprite se usa el retrato estático y, si hay hue, ese tinte.
  // Un spritesheet nuevo es una línea: sprite: 'assets/ui/<id>-sheet.png'.
  var LIST = [
    {
      id: 'parade-feather',
      label: 'Parade Feather',
      chart: 'charts/parade-feather.json',
      sprite: 'assets/ui/parade-feather-sheet.png',
      portrait: 'assets/ui/parade-feather-portrait.jpg'
    },
    {
      id: 'veil-boat',
      label: 'The Veil Boat',
      chart: 'charts/veil-boat.json',
      hue: 'hue-rotate(185deg) saturate(1.15)'
    },
    {
      id: 'tower-chime',
      label: 'Tower Chime',
      chart: 'charts/tower-chime.json',
      hue: 'hue-rotate(262deg) saturate(1.3)'
    },
    {
      id: 'new-world-largo',
      label: 'New World Largo',
      chart: 'charts/new-world-largo.json',
      hue: 'hue-rotate(330deg) saturate(1.45) brightness(1.08)'
    },
    {
      id: 'camptown-races',
      label: 'Camptown Races',
      chart: 'charts/camptown-races.json',
      hue: 'hue-rotate(95deg) saturate(0.25) brightness(1.45)'
    },
    {
      id: 'eine-kleine',
      label: 'Eine Kleine Nachtmusik',
      chart: 'charts/eine-kleine.json',
      hue: 'hue-rotate(200deg) saturate(0.85) brightness(0.75)'
    }
  ];

  function options() {
    return LIST.map(function (r) {
      return {
        id: r.id,
        label: r.label,
        chart: r.chart,
        free: false,
        sprite: r.sprite || null,
        portrait: r.portrait || null,
        hue: r.hue || null
      };
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
