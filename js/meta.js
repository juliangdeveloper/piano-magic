'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Meta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_STATS = 20;

  var FASE = Object.freeze({ IDEA: 1, DEFINICION: 2, DISENO: 3, CONSTRUCCION: 4, VALIDACION: 5, LANZAMIENTO_Y_MANTENIMIENTO: 6, DESCARTADA: 7 });
  var ESTADO_FASE = Object.freeze({ PENDIENTE: 0, EN_CURSO: 1, BLOQUEADA: 2, EN_REVISION: 3, COMPLETADA: 4 });
  var TIPO_STAT = Object.freeze({ TOTAL_ACUMULADO: 'total_acumulado', MEJOR_MARCA: 'mejor_marca', VALOR_ACTUAL: 'valor_actual' });
  var TIPO_PROYECTO = Object.freeze({ PROYECTO: 'proyecto', AREA: 'area', RECURSO: 'recurso', ARCHIVO: 'archivo' });

  var PROYECTO = {
    objetivo: 'Juego de combate musical publicado en la App Store: vencer a cada jefe tocando su partitura en un piano real.',
    fase: FASE.DISENO,
    fase_estado: ESTADO_FASE.EN_CURSO,
    fases_completadas: 2,
    tipo: TIPO_PROYECTO.PROYECTO,
    bloqueada: true,
    aportes: [
      { stat: 'Programación', exp: 64, fuente: 'creacion' },
      { stat: 'Diseño', exp: 12, fuente: 'creacion' },
      { stat: 'Arte', exp: 2, fuente: 'creacion' },
      { stat: 'Música', exp: 6, fuente: 'creacion' },
      { stat: 'Oído musical', exp: 20, fuente: 'uso' },
      { stat: 'Lectura musical', exp: 10, fuente: 'uso' }
    ]
  };

  var proyectoSource = PROYECTO;

  function proyectoInt(n, lo, hi) {
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  }

  function enumValido(enumeracion, valor) {
    return Object.values(enumeracion).indexOf(valor) !== -1;
  }

  function statConservaMaximo(tipo) {
    return tipo === TIPO_STAT.TOTAL_ACUMULADO || tipo === TIPO_STAT.MEJOR_MARCA;
  }

  function statsDeclarados(stats) {
    if (Array.isArray(stats)) return stats;
    if (!stats || typeof stats !== 'object') return [];
    return Object.keys(stats).map(function (key) { return { key: key, tipo: stats[key] && stats[key].tipo }; });
  }

  var APORTE_STAT_MAX = 32;
  var APORTE_EXP_MAX = 99;

  function aportesValidos(lista) {
    if (!Array.isArray(lista)) return null;
    var out = [];
    var seen = {};
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i];
      if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
      var stat = it.stat;
      var exp = it.exp;
      var fuente = it.fuente;
      if (typeof stat !== 'string' || !stat.trim() || stat !== stat.trim() || Array.from(stat).length > APORTE_STAT_MAX) return null;
      if (fuente !== 'creacion' && fuente !== 'uso') return null;
      if (!(proyectoInt(exp, 1, APORTE_EXP_MAX))) return null;
      var key = stat + '\n' + fuente;
      if (seen[key]) return null;
      if (Object.keys(it).length !== 3) return null;
      seen[key] = true;
      out.push({ stat: stat, exp: exp, fuente: fuente });
    }
    return out;
  }

  function metaProyecto(p) {
    try {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      var o = p.objetivo;
      if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
      if (!enumValido(FASE, p.fase) || !enumValido(ESTADO_FASE, p.fase_estado) || !proyectoInt(p.fases_completadas, 0, FASE.LANZAMIENTO_Y_MANTENIMIENTO)) return null;
      if (p.tipo !== undefined && !enumValido(TIPO_PROYECTO, p.tipo)) return null;
      var bloque = { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
      if (p.tipo !== undefined) bloque.tipo = p.tipo;
      if (p.bloqueada === true) bloque.bloqueada = true;
      if (p.aportes !== undefined) {
        var aportes = aportesValidos(p.aportes);
        if (!aportes) return null;
        bloque.aportes = aportes;
      }
      return bloque;
    } catch (e) {
      return null;
    }
  }

  function metaSetProyecto(p) {
    proyectoSource = p === null ? PROYECTO : p;
  }

  function metaDeclararProyecto(slug, version) {
    try {
      var store = globalThis.localStorage;
      if (!store || !slug) return null;
      var clave = 'meta.v1.' + slug;
      var raw = store.getItem(clave);
      var base = null;
      if (raw != null && raw !== '') {
        try {
          var previo = JSON.parse(raw);
          if (previo && typeof previo === 'object' && !Array.isArray(previo) && previo.v === 1 && previo.slug === slug) base = previo;
        } catch (e) {
          base = null;
        }
        if (!base) store.setItem(clave + '.corrupt', String(raw));
      }
      if (!base) base = { v: 1, slug: slug, version: String(version == null ? '' : version).replace(/^[vV]/, ''), updatedAt: new Date().toISOString(), stats: {}, logros: [], hitos: {} };
      var p = metaProyecto(proyectoSource);
      if (p) base.proyecto = p;
      var texto = JSON.stringify(base);
      if (texto !== raw) {
        store.setItem(clave, texto);
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage({ type: 'meta', key: clave, data: base }, location.origin);
      }
      return base;
    } catch (e) {
      return null;
    }
  }

  function withProyecto(record) {
    var p = metaProyecto(proyectoSource);
    if (p) record.proyecto = p;
    return record;
  }

  function metaKey(slug) {
    return 'meta.v1.' + slug;
  }

  function finiteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function plainVersion(version) {
    var s = version == null ? '' : String(version);
    if (s.charAt(0) === 'v' || s.charAt(0) === 'V') s = s.slice(1);
    return s;
  }

  function declaredList(declare) {
    var list = [];
    var seen = {};
    declare = statsDeclarados(declare);
    for (var i = 0; i < declare.length && list.length < MAX_STATS; i++) {
      var item = declare[i];
      var key = typeof item === 'string' ? item : (item && item.key);
      if (typeof key !== 'string' || !key || seen[key]) continue;
      seen[key] = true;
      list.push({ key: key, tipo: item && item.tipo });
    }
    return list;
  }

  function nowIso(now) {
    if (typeof now === 'string' && now) return now;
    if (now instanceof Date) return now.toISOString();
    return new Date().toISOString();
  }

  function parseRaw(raw) {
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function usableRecord(parsed, slug) {
    return !!(parsed && parsed.v === 1 && parsed.slug === slug);
  }

  function metaUpdate(slug, version, patch, opts) {
    var record = null;
    try {
      opts = opts || {};
      patch = patch || {};
      var storage = opts.storage;
      if (!storage) {
        try { storage = (typeof localStorage !== 'undefined') ? localStorage : null; } catch (eStore) { storage = null; }
      }
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;

      var key = metaKey(slug);
      var raw = null;
      try { raw = storage.getItem(key); } catch (eRead) { raw = null; }
      var existing = null;
      if (raw != null) {
        var parsed = parseRaw(raw);
        if (!usableRecord(parsed, slug)) {
          try { storage.setItem(key + '.corrupt', String(raw)); } catch (eCopy) {}
        } else {
          existing = parsed;
        }
      }

      var stamp = nowIso(opts.now);
      var decl = declaredList(opts.declare);
      var src = (existing && existing.stats && typeof existing.stats === 'object' && !Array.isArray(existing.stats)) ? existing.stats : {};
      var incoming = (patch.stats && typeof patch.stats === 'object' && !Array.isArray(patch.stats)) ? patch.stats : {};
      var stats = {};
      var i;
      for (i = 0; i < decl.length; i++) {
        var item = decl[i];
        var hasNew = Object.prototype.hasOwnProperty.call(incoming, item.key) && finiteNumber(incoming[item.key]);
        var hasOld = finiteNumber(src[item.key]);
        if (hasNew && hasOld && statConservaMaximo(item.tipo)) stats[item.key] = Math.max(src[item.key], incoming[item.key]);
        else if (hasNew) stats[item.key] = incoming[item.key];
        else if (hasOld) stats[item.key] = src[item.key];
      }

      var seen = {};
      var hitosIn = {};
      var oldHitos = (existing && existing.hitos && typeof existing.hitos === 'object' && !Array.isArray(existing.hitos)) ? existing.hitos : {};
      var oldLogros = (existing && Array.isArray(existing.logros)) ? existing.logros : [];
      var id;
      for (i = 0; i < oldLogros.length; i++) {
        id = oldLogros[i];
        if (typeof id !== 'string' || !id) continue;
        seen[id] = true;
      }
      for (id in oldHitos) {
        if (!Object.prototype.hasOwnProperty.call(oldHitos, id)) continue;
        if (typeof id !== 'string' || !id) continue;
        if (typeof oldHitos[id] === 'string' && oldHitos[id]) {
          hitosIn[id] = oldHitos[id];
          seen[id] = true;
        }
      }
      var add = Array.isArray(patch.logros) ? patch.logros : [];
      for (i = 0; i < add.length; i++) {
        id = add[i];
        if (typeof id !== 'string' || !id) continue;
        seen[id] = true;
        if (!hitosIn[id]) hitosIn[id] = stamp;
      }
      var ids = Object.keys(seen).sort();
      var hitos = {};
      for (i = 0; i < ids.length; i++) hitos[ids[i]] = hitosIn[ids[i]] || stamp;

      record = {
        v: 1,
        slug: slug,
        version: plainVersion(version),
        updatedAt: stamp,
        stats: stats,
        logros: ids,
        hitos: hitos
      };
      withProyecto(record);
      storage.setItem(key, JSON.stringify(record));

      try {
        var view = null;
        if (opts && Object.prototype.hasOwnProperty.call(opts, 'window')) view = opts.window;
        else if (typeof window !== 'undefined') view = window;
        if (view && view.parent && view.parent !== view && typeof view.parent.postMessage === 'function') {
          var origin = '';
          try {
            if (opts && opts.location && opts.location.origin) origin = opts.location.origin;
            else if (typeof location !== 'undefined' && location && location.origin) origin = location.origin;
          } catch (eOrigin) {}
          view.parent.postMessage({ type: 'meta', key: key, data: record }, origin);
        }
      } catch (ePost) {}
    } catch (e) {
      return null;
    }
    return record;
  }

  return {
    metaKey: metaKey,
    metaUpdate: metaUpdate,
    metaProyecto: metaProyecto,
    metaSetProyecto: metaSetProyecto,
    metaDeclararProyecto: metaDeclararProyecto,
    PROYECTO: PROYECTO,
    FASE: FASE,
    ESTADO_FASE: ESTADO_FASE,
    TIPO_STAT: TIPO_STAT,
    TIPO_PROYECTO: TIPO_PROYECTO,
    enumValido: enumValido,
    statConservaMaximo: statConservaMaximo,
    statsDeclarados: statsDeclarados
  };
});
