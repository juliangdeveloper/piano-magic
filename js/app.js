// js/app.js — cinta, HUD, tutorial, teclado físico y en pantalla.
// El teclado en pantalla usa el mismo KEY_MAP → noteOn → InstrumentTranslator que el QWERTY.
'use strict';

(function () {
  var VERSION = '0.1.3';
  var CHART_URL = 'charts/raindrops-thunder.json?v=' + VERSION;
  var KB_KEY = 'onscreenKeyboard';

  var director = null;
  var tape = null;
  var hud = null;
  var tutorial = null;
  var audioCtx = null;
  var runningLoop = false;
  var lastClickBeat = -1;
  var heldKeys = {};
  var midiStatus = '';
  var tickTimer = null;
  var midiReady = false;
  var tutorialBooted = false;
  var lastHz = 0;

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
    // El metrónomo no encola clics: si el audio aún no corre, se salta este beat.
    if (!ctx || ctx.state !== 'running') return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    var t0 = ctx.currentTime;
    var peak = gain == null ? 0.1 : gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playPitch(pitch) {
    var freq = hz(pitch);
    lastHz = freq;
    // Fundamental + octava suave. Audible por defecto; sin samples ni CDN.
    var ctx = ensureAudio();
    if (!ctx) return;
    var start = function () {
      if (!ctx || ctx.state === 'closed') return;
      var t0 = ctx.currentTime;
      var master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.2, t0 + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.48);
      master.connect(ctx.destination);
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(master);
      var over = ctx.createOscillator();
      var og = ctx.createGain();
      over.type = 'sine';
      over.frequency.value = freq * 2;
      og.gain.value = 0.28;
      over.connect(og);
      og.connect(master);
      osc.start(t0);
      over.start(t0);
      osc.stop(t0 + 0.52);
      over.stop(t0 + 0.52);
    };
    if (ctx.state === 'running') start();
    else {
      var resumed = ctx.resume();
      if (resumed && resumed.then) resumed.then(start);
      else start();
    }
  }

  function metronomeClick(strong) {
    beep(strong ? 1320 : 880, 0.04, 'square', strong ? 0.07 : 0.04);
  }

  function pitchForKey(key) {
    if (!key || !window.InstrumentTranslator) return null;
    return InstrumentTranslator.KEY_MAP[String(key).toLowerCase()] || null;
  }

  function tutorialOpen() {
    return !!(tutorial && tutorial.isOpen());
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
      stopLoop();
      return;
    }
    if (runningLoop) requestAnimationFrame(render);
  }

  function stopLoop() {
    runningLoop = false;
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
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

  function refreshTape() {
    if (!tape || !director) return;
    tape.resize();
    tape.render(director.snapshot(performance.now()));
  }

  function startFight() {
    if (!director || tutorialOpen()) return;
    ensureAudio();
    if (!midiReady) {
      midiReady = true;
      setupMidi();
    }
    hideOutcome();
    lastClickBeat = -1;
    stopLoop();
    director.start(performance.now());
    runningLoop = true;
    $('btnStart').className = 'hidden';
    tickTimer = setInterval(function () {
      if (!runningLoop) return;
      render();
    }, 50);
    requestAnimationFrame(render);
  }

  function restartFight() {
    if (!director || tutorialOpen()) return;
    director.reset();
    startFight();
  }

  function noteOn(pitch) {
    if (tutorialOpen()) return;
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
    var btn = document.querySelector('#piano .key[data-pitch="' + pitch + '"]');
    if (!btn) return;
    if (down) btn.classList.add('down');
    else btn.classList.remove('down');
  }

  function onKeyDown(ev) {
    if (tutorialOpen()) return;
    if (ev.repeat) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var pitch = pitchForKey(ev.key);
    if (!pitch) return;
    ev.preventDefault();
    noteOn(pitch);
  }

  function onKeyUp(ev) {
    var pitch = pitchForKey(ev.key);
    if (!pitch) return;
    ev.preventDefault();
    noteOff(pitch);
  }

  function shortPitch(pitch) {
    return String(pitch).replace(/4$/, '');
  }

  function buildPiano() {
    var piano = $('piano');
    if (!piano || !window.InstrumentTranslator) return;
    piano.textContent = '';
    var blacks = { W: true, E: true, T: true, Y: true, U: true };
    var labels = InstrumentTranslator.KEY_LABELS;
    for (var i = 0; i < labels.length; i++) {
      var item = labels[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key ' + (blacks[item.key] ? 'black' : 'white');
      btn.setAttribute('data-key', item.key.toLowerCase());
      var pitch = pitchForKey(item.key);
      if (pitch) btn.setAttribute('data-pitch', pitch);
      btn.setAttribute('aria-label', item.key + ' ' + item.pitch);
      var k = document.createElement('span');
      k.className = 'k';
      k.textContent = item.key;
      var p = document.createElement('span');
      p.className = 'p';
      p.textContent = shortPitch(item.pitch);
      btn.appendChild(k);
      btn.appendChild(p);
      piano.appendChild(btn);
    }
  }

  function bindOnscreenKeys() {
    var keys = document.querySelectorAll('#piano .key');
    keys.forEach(function (btn) {
      var pointers = {};
      btn.addEventListener('pointerdown', function (e) {
        if (tutorialOpen()) return;
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        var pitch = pitchForKey(btn.getAttribute('data-key'));
        pointers[e.pointerId] = pitch;
        noteOn(pitch);
      });
      function release(e) {
        var pitch = pointers[e.pointerId];
        if (!pitch) return;
        delete pointers[e.pointerId];
        noteOff(pitch);
      }
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  function defaultKeyboardOn() {
    var narrow = false;
    var coarse = false;
    try {
      narrow = window.matchMedia('(max-width: 700px)').matches;
      coarse = window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {}
    var touch = (navigator.maxTouchPoints || 0) > 0;
    return !!(narrow || coarse || touch);
  }

  function readKeyboardPref() {
    try {
      var v = localStorage.getItem(KB_KEY);
      if (v === 'on') return true;
      if (v === 'off') return false;
    } catch (e) {}
    return defaultKeyboardOn();
  }

  function applyKeyboard(on, persist) {
    var dock = $('keys');
    if (dock) dock.hidden = !on;
    document.body.classList.toggle('kb-on', !!on);
    var btn = $('btnKeyboard');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('on', !!on);
      btn.textContent = on ? 'Teclado: sí' : 'Teclado';
    }
    if (persist) {
      try { localStorage.setItem(KB_KEY, on ? 'on' : 'off'); } catch (e) {}
    }
    requestAnimationFrame(refreshTape);
  }

  function setupMidi() {
    var status = $('midiStatus');
    if (!navigator.requestMIDIAccess) {
      midiStatus = 'MIDI no disponible · teclado A–K y el teclado en pantalla';
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
            if (cmd === 0x90 && vel > 0) noteOn(pitch);
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
    tape = Tape.create($('tape'), { version: VERSION });
    hud = Hud.create();
    var idle = director.snapshot(0);
    hud.render(idle);
    requestAnimationFrame(function () {
      refreshTape();
    });
    tape.render(idle);
    $('version').textContent = 'v' + VERSION;
    window.PianoMagic = {
      VERSION: VERSION,
      director: director,
      start: startFight,
      restart: restartFight,
      noteOn: noteOn,
      noteOff: noteOff,
      tutorial: tutorial,
      setKeyboard: function (on) { applyKeyboard(!!on, true); },
      keyboardOn: function () { return !$('keys').hidden; },
      lastHz: function () { return lastHz; },
      audioContext: function () { return audioCtx; }
    };
    maybeTutorial();
  }

  function maybeTutorial() {
    if (tutorialBooted || !tutorial) return;
    tutorialBooted = true;
    tutorial.maybeStart();
  }

  function init() {
    buildPiano();
    bindOnscreenKeys();
    applyKeyboard(readKeyboardPref(), false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', function () { ensureAudio(); });
    $('btnStart').addEventListener('click', startFight);
    $('btnRestart').addEventListener('click', restartFight);
    $('btnKeyboard').addEventListener('click', function () {
      if (tutorialOpen()) return;
      applyKeyboard($('keys').hidden, true);
    });

    tutorial = Tutorial.create({
      onStep: function (step) {
        if (step.showKeyboard) applyKeyboard(true, false);
      },
      onClose: function () {
        applyKeyboard(readKeyboardPref(), false);
        refreshTape();
      }
    });
    $('btnHelp').addEventListener('click', function () {
      tutorial.replay();
    });

    if (window.PianoMagic) window.PianoMagic.tutorial = tutorial;

    fetch(CHART_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(boot).catch(function (err) {
      showError('No se pudo cargar el chart. Sirve la carpeta con un servidor estático (python -m http.server) — ' + err.message);
      maybeTutorial();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
