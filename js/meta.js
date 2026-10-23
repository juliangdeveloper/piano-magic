'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Meta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_STATS = 20;

  var PROYECTO = {
    objetivo: 'Juego de combate musical: vencer a cada jefe tocando su partitura en un piano real, con jefes animados y varias canciones.',
    fase: 4,
    fase_estado: 1,
    fases_completadas: 3
  };

  var proyectoSource = PROYECTO;

  function proyectoInt(n, lo, hi) {
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  }

  function metaProyecto(p) {
    try {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      var o = p.objetivo;
      if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
      if (!proyectoInt(p.fase, 1, 6) || !proyectoInt(p.fase_estado, 0, 4) || !proyectoInt(p.fases_completadas, 0, 6)) return null;
      return { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
    } catch (e) {
      return null;
    }
  }

  function metaSetProyecto(p) {
    proyectoSource = p === null ? PROYECTO : p;
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

  function demoOn(opts) {
    if (opts && opts.demo === true) return true;
    var search = '';
    if (opts && typeof opts.search === 'string') search = opts.search;
    else {
      try {
        if (typeof location !== 'undefined' && location && typeof location.search === 'string') search = location.search;
      } catch (e) {}
    }
    return /(^|[?&])(demo|preview)=1(&|$)/.test(search);
  }

  function declaredList(declare) {
    var list = [];
    var seen = {};
    if (!Array.isArray(declare)) return list;
    for (var i = 0; i < declare.length && list.length < MAX_STATS; i++) {
      var item = declare[i];
      var key = typeof item === 'string' ? item : (item && item.key);
      if (typeof key !== 'string' || !key || seen[key]) continue;
      seen[key] = true;
      list.push({ key: key, monotonic: !!(item && item.monotonic) });
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
      if (demoOn(opts)) return null;
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
        if (hasNew && hasOld && item.monotonic) stats[item.key] = Math.max(src[item.key], incoming[item.key]);
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
    PROYECTO: PROYECTO
  };
});
