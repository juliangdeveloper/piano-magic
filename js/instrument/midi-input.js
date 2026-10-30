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
  var HANDLER_NAME = 'nativeMidi';
  var GLOBAL_NAME = '__nativeMidi';
  var ACTION_START = 'start';
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

  function nativeHandler(env) {
    var handlers = env && env.webkit && env.webkit.messageHandlers;
    var handler = handlers && handlers[HANDLER_NAME];
    return handler && typeof handler.postMessage === 'function' ? handler : null;
  }

  function startNative(env, handler, handlers) {
    env[GLOBAL_NAME] = {
      emit: function (m) {
        if (!m) return;
        dispatch(handlers, m.status, m.data1, m.data2);
      },
      devices: function (count) {
        call(handlers.onDevices, count || 0);
      },
      blocked: function () {
        call(handlers.onBlocked);
      }
    };
    try {
      handler.postMessage({ action: ACTION_START });
    } catch (e) {
      call(handlers.onBlocked);
    }
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
    var handler = nativeHandler(env);
    if (handler) {
      startNative(env, handler, handlers);
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
    HANDLER_NAME: HANDLER_NAME,
    GLOBAL_NAME: GLOBAL_NAME,
    parse: parse,
    start: start
  };
});
