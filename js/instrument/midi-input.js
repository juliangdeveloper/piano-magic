'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MidiInput = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUS_MASK = 0xf0;
  var NOTE_ON = 0x90;
  var NOTE_OFF = 0x80;
  var MIN_MESSAGE_BYTES = 2;
  var VELOCITY_INDEX = 2;
  var PLUGIN_NAME = 'NativeMidi';
  var EVENT_MESSAGE = 'midi';
  var EVENT_DEVICES = 'devices';
  var KIND_ON = 'on';
  var KIND_OFF = 'off';
  var SOURCE_NATIVE = 'native';
  var SOURCE_WEB = 'web';
  var SOURCE_NONE = 'none';

  function parse(status, data1, data2) {
    var cmd = status & STATUS_MASK;
    var vel = data2 == null ? 0 : data2;
    if (cmd === NOTE_ON && vel > 0) return { kind: KIND_ON, note: data1, velocity: vel };
    if (cmd === NOTE_OFF || (cmd === NOTE_ON && vel === 0)) return { kind: KIND_OFF, note: data1, velocity: vel };
    return null;
  }

  function dispatch(handlers, status, data1, data2) {
    var msg = parse(status, data1, data2);
    if (msg && handlers.onNote) handlers.onNote(msg.kind, msg.note, msg.velocity);
  }

  function call(fn, arg) {
    if (typeof fn === 'function') fn(arg);
  }

  function nativePlugin(env) {
    var cap = env && env.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(PLUGIN_NAME);
    if (cap.Plugins && cap.Plugins[PLUGIN_NAME]) return cap.Plugins[PLUGIN_NAME];
    if (typeof cap.nativePromise !== 'function' || typeof cap.addListener !== 'function') return null;
    return {
      start: function () { return cap.nativePromise(PLUGIN_NAME, 'start', {}); },
      addListener: function (eventName, fn) { return cap.addListener(PLUGIN_NAME, eventName, fn); }
    };
  }

  function startNative(plugin, handlers) {
    plugin.addListener(EVENT_MESSAGE, function (m) {
      if (!m) return;
      dispatch(handlers, m.status, m.data1, m.data2);
    });
    plugin.addListener(EVENT_DEVICES, function (d) {
      call(handlers.onDevices, (d && d.count) || 0);
    });
    return Promise.resolve(plugin.start()).then(function (r) {
      call(handlers.onDevices, (r && r.count) || 0);
    }).catch(function () {
      call(handlers.onBlocked);
    });
  }

  function startWeb(nav, handlers) {
    return nav.requestMIDIAccess().then(function (access) {
      function hook() {
        var n = 0;
        access.inputs.forEach(function (input) {
          n += 1;
          input.onmidimessage = function (ev) {
            var d = ev.data;
            if (!d || d.length < MIN_MESSAGE_BYTES) return;
            dispatch(handlers, d[0], d[1], d.length > VELOCITY_INDEX ? d[VELOCITY_INDEX] : 0);
          };
        });
        call(handlers.onDevices, n);
      }
      hook();
      access.onstatechange = hook;
    }).catch(function () {
      call(handlers.onBlocked);
    });
  }

  function start(handlers, env) {
    handlers = handlers || {};
    env = env || (typeof window !== 'undefined' ? window : {});
    var plugin = nativePlugin(env);
    if (plugin) {
      startNative(plugin, handlers);
      return SOURCE_NATIVE;
    }
    var nav = env.navigator;
    if (nav && nav.requestMIDIAccess) {
      startWeb(nav, handlers);
      return SOURCE_WEB;
    }
    call(handlers.onUnavailable);
    return SOURCE_NONE;
  }

  return {
    KIND_ON: KIND_ON,
    KIND_OFF: KIND_OFF,
    PLUGIN_NAME: PLUGIN_NAME,
    parse: parse,
    start: start
  };
});
