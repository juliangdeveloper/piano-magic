// js/meta.js — registro compartido meta.v1.
// UMD: module.exports + window.Meta.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Meta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_STATS = 20;

  function metaKey(slug) {
    return 'meta.v1.' + slug;
  }

  function finiteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function readRecord(storage, key) {
    var raw;
    try { raw = storage.getItem(key); } catch (e) { return null; }
    if (typeof raw !== 'string' || !raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch (e2) {
      return null;
    }
  }

  function nowIso(now) {
    if (typeof now === 'string' && now) return now;
    if (now instanceof Date) return now.toISOString();
    return new Date().toISOString();
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
      var existing = readRecord(storage, key) || {};
      var stamp = nowIso(opts.now);
      var stats = {};
      var src = (existing.stats && typeof existing.stats === 'object' && !Array.isArray(existing.stats)) ? existing.stats : {};
      var incoming = (patch.stats && typeof patch.stats === 'object' && !Array.isArray(patch.stats)) ? patch.stats : {};
      var k;
      var count = 0;
      for (k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
        if (!finiteNumber(src[k])) continue;
        stats[k] = src[k];
        count += 1;
      }
      for (k in incoming) {
        if (!Object.prototype.hasOwnProperty.call(incoming, k)) continue;
        if (!finiteNumber(incoming[k])) continue;
        if (Object.prototype.hasOwnProperty.call(stats, k)) {
          stats[k] = incoming[k];
        } else if (count < MAX_STATS) {
          stats[k] = incoming[k];
          count += 1;
        }
      }

      var seen = {};
      var hitosIn = {};
      var oldHitos = (existing.hitos && typeof existing.hitos === 'object' && !Array.isArray(existing.hitos)) ? existing.hitos : {};
      var oldLogros = Array.isArray(existing.logros) ? existing.logros : [];
      var i;
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
      for (i = 0; i < ids.length; i++) {
        hitos[ids[i]] = hitosIn[ids[i]] || stamp;
      }

      record = {
        v: 1,
        slug: slug,
        version: version == null ? '' : String(version),
        updatedAt: stamp,
        stats: stats,
        logros: ids,
        hitos: hitos
      };
      storage.setItem(key, JSON.stringify(record));

      try {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window && typeof window.parent.postMessage === 'function') {
          var origin = '';
          try { origin = (typeof location !== 'undefined' && location && location.origin) ? location.origin : ''; } catch (eOrigin) {}
          window.parent.postMessage({ type: 'meta', key: key, data: record }, origin);
        }
      } catch (ePost) {}
    } catch (e) {
      return null;
    }
    return record;
  }

  return {
    metaKey: metaKey,
    metaUpdate: metaUpdate
  };
});
