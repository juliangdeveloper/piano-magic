// js/app.js — cinta, HUD, tutorial, pausa, teclado físico y en pantalla.
// Cada NoteOn (pantalla, QWERTY, MIDI) pasa por InstrumentTranslator y suena.
// El AudioContext se desbloquea en el mismo gesto, antes de preventDefault.
'use strict';

(function () {
  var VERSION = '0.1.4';
  var CHART_URL = 'charts/raindrops-thunder.json?v=' + VERSION;
  var KB_KEY = 'onscreenKeyboard';

  var director = null;
  var tape = null;
  var hud = null;
  var tutorial = null;
  var audioCtx = null;
  var masterGain = null;
  var analyser = null;
  var peakBuf = null;
  var audioUnlocked = false;
  var audioHeldForPause = false;
  var runningLoop = false;
  var paused = false;
  var lastClickBeat = -1;
  var heldKeys = {};
  var midiStatus = '';
  var tickTimer = null;
  var midiReady = false;
  var tutorialBooted = false;
  var lastHz = 0;
  var tonesPlayed = 0;
  var playerTones = 0;
  var bossTones = 0;
  var bossHeard = {};
  var lastAudioBeat = 0;

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

  function getAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      try { audioCtx = new AC(); } catch (e) { return null; }
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.78;
      masterGain.connect(audioCtx.destination);
      try {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.15;
        masterGain.connect(analyser);
        // El analizador tiene que llegar al destino para que el grafo lo procese.
        var tap = audioCtx.createGain();
        tap.gain.value = 0;
        analyser.connect(tap);
        tap.connect(audioCtx.destination);
      } catch (e2) {}
    }
    return audioCtx;
  }

  // Buffer mudo + resume en el turno del gesto. iOS/Android ignoran el audio
  // si el primer start() queda solo dentro de resume().then(), o si preventDefault
  // corre antes de crear/reanudar el contexto.
  function primeAudio() {
    var ctx = getAudio();
    if (!ctx) return null;
    if (paused || audioHeldForPause) return ctx;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try { ctx.resume(); } catch (e) {}
    }
    if (!audioUnlocked) {
      try {
        var rate = ctx.sampleRate || 22050;
        var buf = ctx.createBuffer(1, 1, rate);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(masterGain || ctx.destination);
        src.start(0);
        audioUnlocked = true;
      } catch (e3) {}
    }
    return ctx;
  }

  function samplePeak() {
    if (!analyser) return 0;
    if (!peakBuf || peakBuf.length !== analyser.fftSize) peakBuf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(peakBuf);
    var peak = 0;
    var i;
    var v;
    for (i = 0; i < peakBuf.length; i++) {
      v = peakBuf[i] - 128;
      if (v < 0) v = -v;
      if (v > peak) peak = v;
    }
    return peak;
  }

  function startVoice(ctx, freq, opts) {
    var peak = opts.gain == null ? 0.28 : opts.gain;
    var dur = opts.dur == null ? 0.46 : opts.dur;
    var type = opts.type || 'triangle';
    var t0 = ctx.currentTime;
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    amp.gain.linearRampToValueAtTime(peak * 0.55, t0 + Math.max(0.04, dur * 0.4));
    amp.gain.linearRampToValueAtTime(0, t0 + dur);
    amp.connect(masterGain || ctx.destination);
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(amp);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    if (opts.overtone !== false) {
      var over = ctx.createOscillator();
      var og = ctx.createGain();
      over.type = 'sine';
      over.frequency.setValueAtTime(freq * 2, t0);
      og.gain.setValueAtTime(0.22, t0);
      over.connect(og);
      og.connect(amp);
      over.start(t0);
      over.stop(t0 + dur + 0.03);
    }
    tonesPlayed += 1;
    if (opts.role === 'boss') bossTones += 1;
    else if (opts.role !== 'metro') playerTones += 1;
  }

  function playFreq(freq, opts) {
    opts = opts || {};
    if (paused || !freq) return;
    var ctx = primeAudio();
    if (!ctx) return;
    var played = false;
    function emit() {
      if (played || paused || !ctx || ctx.state !== 'running') return;
      played = true;
      try { startVoice(ctx, freq, opts); } catch (e) {}
    }
    emit();
    if (played || opts.immediate) return;
    var kick = function () { emit(); };
    try {
      var resumed = ctx.resume();
      if (resumed && typeof resumed.then === 'function') resumed.then(kick);
    } catch (e2) {}
    setTimeout(kick, 0);
    setTimeout(kick, 60);
    setTimeout(kick, 180);
  }

  function playPitch(pitch, opts) {
    opts = opts || {};
    var freq = hz(pitch);
    if (opts.role !== 'boss' && opts.role !== 'metro') lastHz = freq;
    playFreq(freq, opts);
  }

  function metronomeClick(strong) {
    playFreq(strong ? 1320 : 880, {
      gain: strong ? 0.045 : 0.028,
      dur: 0.04,
      type: 'square',
      overtone: false,
      role: 'metro',
      immediate: true
    });
  }

  function playChartMelody(state) {
    if (!state || state.paused || !state.running || state.ended) return;
    if (state.phase !== 'defend' && state.phase !== 'setup') {
      lastAudioBeat = state.beat;
      return;
    }
    var from = lastAudioBeat;
    var to = state.beat;
    lastAudioBeat = to;
    if (!(to > from) || (to - from) > 2) return;
    var bars = state.ribbon || [];
    var i;
    var j;
    var bar;
    var notes;
    var note;
    var abs;
    var id;
    for (i = 0; i < bars.length; i++) {
      bar = bars[i];
      if (!bar || bar.kind === 'hole') continue;
      if (bar.kind !== 'defend' && bar.kind !== 'setup') continue;
      notes = bar.notes || [];
      for (j = 0; j < notes.length; j++) {
        note = notes[j];
        abs = bar.startBeat + note.beat;
        if (abs <= from || abs > to + 1e-4) continue;
        id = bar.globalBar + ':' + note.beat + ':' + note.pitch;
        if (bossHeard[id]) continue;
        bossHeard[id] = true;
        playPitch(note.pitch, {
          role: 'boss',
          gain: 0.13,
          type: 'sine',
          dur: 0.48,
          overtone: false
        });
      }
    }
  }

  function pitchForKey(key) {
    if (!key || !window.InstrumentTranslator) return null;
    return InstrumentTranslator.KEY_MAP[String(key).toLowerCase()] || null;
  }

  function tutorialOpen() {
    return !!(tutorial && tutorial.isOpen());
  }

  function setPauseUi(on, visible) {
    var btn = $('btnPause');
    var banner = $('pauseBanner');
    if (btn) {
      btn.hidden = !visible;
      btn.textContent = on ? 'Continuar' : 'Pausa';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Continuar' : 'Pausa');
      btn.classList.toggle('on', !!on);
    }
    if (banner) banner.classList.toggle('visible', !!on);
  }

  function releaseHeld() {
    var pitches = Object.keys(heldKeys);
    var i;
    for (i = 0; i < pitches.length; i++) {
      markKey(pitches[i], false);
      if (director) director.noteOff(pitches[i], performance.now());
    }
    heldKeys = {};
  }

  function render() {
    if (!director) return;
    var state = director.tick(performance.now());
    if (tape) tape.render(state);
    if (hud) hud.render(state);
    playChartMelody(state);

    if (state.running && !state.paused) {
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
    paused = false;
    audioHeldForPause = false;
    setPauseUi(false, false);
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
    paused = false;
    audioHeldForPause = false;
    primeAudio();
    if (!midiReady) {
      midiReady = true;
      setupMidi();
    }
    hideOutcome();
    lastClickBeat = -1;
    bossHeard = {};
    lastAudioBeat = 0;
    releaseHeld();
    stopLoop();
    director.start(performance.now());
    runningLoop = true;
    setPauseUi(false, true);
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

  function pauseFight() {
    if (!director || !runningLoop || paused) return;
    var state = director.snapshot(performance.now());
    if (state.ended) return;
    releaseHeld();
    director.pause(performance.now());
    paused = true;
    if (audioCtx && audioCtx.state === 'running') {
      audioHeldForPause = true;
      try { audioCtx.suspend(); } catch (e) {}
    }
    setPauseUi(true, true);
    if (tape) tape.render(director.snapshot(performance.now()));
    if (hud) hud.render(director.snapshot(performance.now()));
  }

  function resumeFight() {
    if (!director || !paused) return;
    if (audioCtx && audioHeldForPause) {
      try { audioCtx.resume(); } catch (e) {}
      audioHeldForPause = false;
    }
    director.resume(performance.now());
    paused = false;
    setPauseUi(false, true);
  }

  function togglePause() {
    if (tutorialOpen() || !director || !runningLoop) return;
    if (paused) resumeFight();
    else pauseFight();
  }

  function noteOn(pitch) {
    if (paused) return;
    if (!pitch || heldKeys[pitch]) return;
    heldKeys[pitch] = true;
    playPitch(pitch);
    markKey(pitch, true);
    // El tutorial puede sonar (desbloquea el audio) pero no entra al combate.
    if (tutorialOpen()) return;
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
    if (ev.repeat) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'p' || ev.key === 'P') {
      if (!tutorialOpen()) togglePause();
      return;
    }
    if (paused) return;
    var pitch = pitchForKey(ev.key);
    if (!pitch) return;
    primeAudio();
    noteOn(pitch);
    ev.preventDefault();
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
        if (paused) return;
        var pitch = pitchForKey(btn.getAttribute('data-key'));
        pointers[e.pointerId] = pitch;
        primeAudio();
        noteOn(pitch);
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
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
      pause: pauseFight,
      resume: resumeFight,
      togglePause: togglePause,
      isPaused: function () { return paused; },
      noteOn: noteOn,
      noteOff: noteOff,
      tutorial: tutorial,
      setKeyboard: function (on) { applyKeyboard(!!on, true); },
      keyboardOn: function () { return !$('keys').hidden; },
      lastHz: function () { return lastHz; },
      audioContext: function () { return audioCtx; },
      tonesPlayed: function () { return tonesPlayed; },
      playerTones: function () { return playerTones; },
      bossTones: function () { return bossTones; },
      samplePeak: samplePeak
    };
    maybeTutorial();
  }

  function maybeTutorial() {
    if (tutorialBooted || !tutorial) return;
    tutorialBooted = true;
    tutorial.maybeStart();
  }

  function onGestureUnlock() {
    if (paused || audioHeldForPause) return;
    primeAudio();
  }

  function init() {
    buildPiano();
    bindOnscreenKeys();
    applyKeyboard(readKeyboardPref(), false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onGestureUnlock, true);
    document.addEventListener('touchend', onGestureUnlock, true);
    document.addEventListener('keydown', onGestureUnlock, true);
    $('btnStart').addEventListener('click', startFight);
    $('btnRestart').addEventListener('click', restartFight);
    $('btnPause').addEventListener('click', togglePause);
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
