// js/app.js — orquestación M0: cinta + HUD + teclado/MIDI + combate.
'use strict';

(function () {
  var VERSION = '0.1.0';
  var CHART_URL = 'charts/raindrops-thunder.json?v=' + VERSION;

  var director = null;
  var tape = null;
  var hud = null;
  var audioCtx = null;
  var runningLoop = false;
  var lastClickBeat = -1;
  var heldKeys = {};
  var midiStatus = '';

  function $(id) { return document.getElementById(id); }

  function showError(msg) {
    var box = $('error');
    if (!box) return;
    box.textContent = msg;
    box.className = 'visible';
  }

  function hz(pitch) {
    return InstrumentTranslator.hzForPitch(pitch, 440) || 261.63;
  }

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, dur, type, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    var t0 = ctx.currentTime;
    g.gain.setValueAtTime(gain == null ? 0.1 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playPitch(pitch) {
    beep(hz(pitch), 0.28, 'triangle', 0.11);
  }

  function metronomeClick(strong) {
    beep(strong ? 1320 : 880, 0.04, 'square', strong ? 0.07 : 0.04);
  }

  function render() {
    if (!director) return;
    var state = director.tick(performance.now());
    if (tape) tape.render(state);
    if (hud) hud.render(state);

    if (state.running) {
      var ibeat = Math.floor(state.beat + 1e-6);
      if (ibeat !== lastClickBeat && ibeat >= 0) {
        lastClickBeat = ibeat;
        metronomeClick((ibeat % state.beatsPerBar) === 0);
      }
    }

    if (state.ended) {
      showOutcome(state);
      runningLoop = false;
      return;
    }
    if (runningLoop) requestAnimationFrame(render);
  }

  function showOutcome(state) {
    var overlay = $('overlay');
    var msg = $('overlayMsg');
    if (!overlay || !msg) return;
    overlay.className = 'visible';
    if (state.outcome === 'win') {
      msg.textContent = 'Victoria';
      msg.className = 'win';
    } else {
      msg.textContent = 'Derrota';
      msg.className = 'lose';
    }
    if (hud) hud.render(state);
    if (tape) tape.render(state);
  }

  function hideOutcome() {
    var overlay = $('overlay');
    if (overlay) overlay.className = '';
  }

  function startFight() {
    if (!director) return;
    ensureAudio();
    hideOutcome();
    lastClickBeat = -1;
    director.start(performance.now());
    runningLoop = true;
    $('btnStart').className = 'hidden';
    requestAnimationFrame(render);
  }

  function restartFight() {
    if (!director) return;
    director.reset();
    startFight();
  }

  function noteOn(pitch, src) {
    if (!pitch || heldKeys[pitch]) return;
    heldKeys[pitch] = true;
    playPitch(pitch);
    markKey(pitch, true);
    if (director) director.noteOn(pitch, performance.now());
  }

  function noteOff(pitch) {
    if (!pitch || !heldKeys[pitch]) return;
    delete heldKeys[pitch];
    markKey(pitch, false);
    if (director) director.noteOff(pitch, performance.now());
  }

  function markKey(pitch, down) {
    var btn = document.querySelector('.key[data-pitch="' + pitch + '"]');
    if (!btn) return;
    if (down) btn.classList.add('down');
    else btn.classList.remove('down');
  }

  function onKeyDown(ev) {
    if (ev.repeat) return;
    var pitch = InstrumentTranslator.KEY_MAP[String(ev.key).toLowerCase()];
    if (!pitch) return;
    ev.preventDefault();
    noteOn(pitch, 'kbd');
  }

  function onKeyUp(ev) {
    var pitch = InstrumentTranslator.KEY_MAP[String(ev.key).toLowerCase()];
    if (!pitch) return;
    ev.preventDefault();
    noteOff(pitch);
  }

  function bindOnscreenKeys() {
    var keys = document.querySelectorAll('.key');
    keys.forEach(function (btn) {
      var pitch = btn.getAttribute('data-pitch');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        noteOn(pitch, 'ui');
      });
      btn.addEventListener('pointerup', function () { noteOff(pitch); });
      btn.addEventListener('pointercancel', function () { noteOff(pitch); });
    });
  }

  function setupMidi() {
    var status = $('midiStatus');
    if (!navigator.requestMIDIAccess) {
      midiStatus = 'MIDI no disponible · teclado A S D = C D E';
      if (status) status.textContent = midiStatus;
      return;
    }
    navigator.requestMIDIAccess().then(function (access) {
      function hook() {
        var n = 0;
        access.inputs.forEach(function (input) {
          n += 1;
          input.onmidimessage = function (ev) {
            var d = ev.data;
            if (!d || d.length < 2) return;
            var cmd = d[0] & 0xf0;
            var note = d[1];
            var vel = d.length > 2 ? d[2] : 0;
            var pitch = InstrumentTranslator.midiToName(note);
            if (cmd === 0x90 && vel > 0) noteOn(pitch, 'midi');
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(pitch);
          };
        });
        midiStatus = n ? ('MIDI · ' + n + ' dispositivo' + (n > 1 ? 's' : '')) : 'MIDI: sin dispositivo · usa el teclado';
        if (status) status.textContent = midiStatus;
      }
      hook();
      access.onstatechange = hook;
    }).catch(function () {
      midiStatus = 'MIDI bloqueado · usa el teclado A S D';
      if (status) status.textContent = midiStatus;
    });
  }

  function boot(chart) {
    director = CombatDirector.create({
      chart: chart,
      now: function () { return performance.now(); }
    });
    tape = Tape.create($('tape'));
    hud = Hud.create();
    var idle = director.snapshot(0);
    hud.render(idle);
    requestAnimationFrame(function () {
      if (tape) tape.resize();
      if (tape) tape.render(director ? director.snapshot(0) : idle);
    });
    tape.render(idle);
    $('version').textContent = 'v' + VERSION;
    window.PianoMagic = {
      VERSION: VERSION,
      director: director,
      start: startFight,
      restart: restartFight
    };
  }

  function init() {
    bindOnscreenKeys();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    $('btnStart').addEventListener('click', startFight);
    $('btnRestart').addEventListener('click', restartFight);
    setupMidi();

    fetch(CHART_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(boot).catch(function (err) {
      showError('No se pudo cargar el chart. Sirve la carpeta con un servidor estático (python -m http.server) — ' + err.message);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
