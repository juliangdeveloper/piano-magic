// js/app.js — cinta, HUD, tutorial, pausa, teclado y micrófono opcional.
// Cada NoteOn (pantalla, QWERTY, MIDI) pasa por InstrumentTranslator y suena.
// El mic usa el mismo noteOn/noteOff, sin segundo disparo si el teclado ya sostiene la nota.
// El AudioContext se desbloquea en el gesto: beep audible + audioSession playback,
// y el oscilador arranca en pointerdown sin esperar a resume().then().
'use strict';

(function () {
  var VERSION = '0.1.5';
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
  var primeUrl = null;
  var synthBlocks = [];
  var micWanted = false;
  var micPending = false;
  var micStream = null;
  var micSource = null;
  var micAnalyser = null;
  var micMute = null;
  var micHp = null;
  var micBuf = null;
  var micTimer = null;
  var micTracker = null;

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

  function iosLike() {
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    var platform = (typeof navigator !== 'undefined' && navigator.platform) || '';
    var touches = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0;
    return platform === 'MacIntel' && touches > 1;
  }

  // playback: altavoz, ignora el silencio del iPhone. play-and-record con el mic.
  // No volvemos a "auto": en Safari eso respeta el mute y a veces deja el speaker mudo.
  function preferSpeaker(micOn) {
    var session = (typeof navigator !== 'undefined') ? navigator.audioSession : null;
    if (!session) return false;
    try {
      session.type = window.MicNotes ? MicNotes.sessionType(!!micOn) : (micOn ? 'play-and-record' : 'playback');
      return true;
    } catch (e) {
      return false;
    }
  }

  function primeWavUrl() {
    if (primeUrl) return primeUrl;
    var sr = 22050;
    var n = 882;
    var dataSize = n * 2;
    var raw = new ArrayBuffer(44 + dataSize);
    var view = new DataView(raw);
    function put(o, s) {
      var i;
      for (i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    }
    put(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    put(8, 'WAVE');
    put(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    put(36, 'data');
    view.setUint32(40, dataSize, true);
    var i;
    for (i = 0; i < n; i++) {
      var env = Math.pow(1 - i / n, 1.4);
      var s = Math.sin(2 * Math.PI * 698.46 * i / sr) * env * 0.22;
      view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, (s * 32767) | 0)), true);
    }
    var bytes = new Uint8Array(raw);
    var bin = '';
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    primeUrl = 'data:audio/wav;base64,' + btoa(bin);
    return primeUrl;
  }

  function playSpeakerEl() {
    var el = $('speakerUnlock');
    if (!el) return;
    try {
      if (!el.getAttribute('src')) {
        el.src = primeWavUrl();
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
      }
      el.volume = 0.45;
      try { el.currentTime = 0; } catch (e0) {}
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  }

  function routeSpeakers(ctx) {
    try {
      var dest = ctx.destination;
      if (dest.maxChannelCount && dest.maxChannelCount >= 2 && dest.channelCount < 2) {
        dest.channelCount = 2;
      }
      dest.channelCountMode = 'explicit';
      dest.channelInterpretation = 'speakers';
    } catch (e) {}
  }

  function getAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      preferSpeaker(false);
      try {
        audioCtx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        try { audioCtx = new AC(); } catch (e2) { return null; }
      }
      routeSpeakers(audioCtx);
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.92;
      masterGain.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  // El analizador no entra en el primer NoteOn: un tap mudo extra retrasa el
  // ataque y en iOS a veces deja la ruta del altavoz en silencio.
  function ensureAnalyser() {
    if (analyser || !audioCtx || !masterGain) return analyser;
    try {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      masterGain.connect(analyser);
      var tap = audioCtx.createGain();
      tap.gain.value = 0;
      analyser.connect(tap);
      tap.connect(audioCtx.destination);
    } catch (e) {}
    return analyser;
  }

  // Beep corto (HTML playsinline + buffer) en el mismo turno del gesto.
  // Un buffer de 1 muestra en silencio deja el altavoz del iPhone/iPad mudo
  // y los auriculares sí suenan. No esperamos a resume().then() para el primer sample.
  function audiblePrime(ctx) {
    var rate = ctx.sampleRate || 44100;
    var n = Math.max(8, Math.floor(rate * 0.03));
    var buf = ctx.createBuffer(1, n, rate);
    var data = buf.getChannelData(0);
    var i;
    for (i = 0; i < n; i++) {
      var env = 1 - i / n;
      data[i] = Math.sin(2 * Math.PI * 698.46 * i / rate) * env * 0.2;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  function primeAudio() {
    var ctx = getAudio();
    if (!ctx) return null;
    if (paused || audioHeldForPause) return ctx;
    preferSpeaker(!!micStream);
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try { ctx.resume(); } catch (e) {}
    }
    if (!audioUnlocked || ctx.state !== 'running') {
      try { audiblePrime(ctx); } catch (e2) {}
      playSpeakerEl();
      audioUnlocked = true;
    }
    return ctx;
  }

  function samplePeak() {
    ensureAnalyser();
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

  function blockSynth(freq, dur) {
    if (!window.Pitch || !freq) return;
    var note = Pitch.noteFromFreq(freq, 440);
    if (!note) return;
    var now = performance.now();
    synthBlocks.push({ midi: note.midi, until: now + (dur || 0.2) * 1000 + 110 });
    var i = 0;
    while (i < synthBlocks.length) {
      if (synthBlocks[i].until < now) synthBlocks.splice(i, 1);
      else i += 1;
    }
    if (synthBlocks.length > 32) synthBlocks.splice(0, synthBlocks.length - 32);
  }

  function startVoice(ctx, freq, opts) {
    var peak = opts.gain == null ? 0.32 : opts.gain;
    var dur = opts.dur == null ? 0.42 : opts.dur;
    var type = opts.type || 'triangle';
    var t0 = ctx.currentTime;
    var amp = ctx.createGain();
    // Ataque ya audible en el primer sample: el ramp desde 0 comía ~12 ms.
    amp.gain.setValueAtTime(peak * 0.7, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    amp.gain.linearRampToValueAtTime(peak * 0.5, t0 + Math.max(0.04, dur * 0.4));
    amp.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    amp.connect(masterGain || ctx.destination);
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(amp);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    if (opts.overtone !== false) {
      var over = ctx.createOscillator();
      var og = ctx.createGain();
      over.type = 'sine';
      over.frequency.setValueAtTime(freq * 2, t0);
      og.gain.setValueAtTime(0.18, t0);
      over.connect(og);
      og.connect(amp);
      over.start(t0);
      over.stop(t0 + dur + 0.02);
    }
    blockSynth(freq, dur);
    tonesPlayed += 1;
    if (opts.role === 'boss') bossTones += 1;
    else if (opts.role !== 'metro') playerTones += 1;
  }

  function playFreq(freq, opts) {
    opts = opts || {};
    if (paused || !freq) return;
    var ctx = getAudio();
    if (!ctx) return;
    preferSpeaker(!!micStream);
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try { ctx.resume(); } catch (e) {}
    }
    // El tono se agenda antes del beep de desbloqueo, para no esperar al WAV.
    try { startVoice(ctx, freq, opts); } catch (e2) {}
    if (!audioUnlocked || ctx.state !== 'running') {
      try { audiblePrime(ctx); } catch (e3) {}
      playSpeakerEl();
      audioUnlocked = true;
    }
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
    // El altavoz del jefe se colaría en el mic y contaría como nota del jugador.
    if (micStream) {
      lastAudioBeat = state.beat;
      return;
    }
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
    if (micTracker && window.MicNotes) MicNotes.reset(micTracker);
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
        if (!micStream) metronomeClick((ibeat % state.beatsPerBar) === 0);
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
    audioHeldForPause = false;
    preferSpeaker(!!micStream);
    if (audioCtx) {
      try { audioCtx.resume(); } catch (e) {}
      playSpeakerEl();
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

  function noteOn(pitch, source, opts) {
    opts = opts || {};
    source = source || 'key';
    if (paused || !pitch || !window.MicNotes) return;
    var merged = MicNotes.mergePress(heldKeys, pitch, source);
    if (merged.sound && !opts.silent) playPitch(pitch);
    if (!merged.fresh) {
      markKey(pitch, true);
      return;
    }
    markKey(pitch, true);
    // El tutorial puede sonar (desbloquea el audio) pero no entra al combate.
    if (tutorialOpen()) return;
    if (merged.combat && director) director.noteOn(pitch, performance.now());
  }

  function noteOff(pitch, source) {
    if (!pitch || !window.MicNotes) return;
    var merged = MicNotes.mergeRelease(heldKeys, pitch, source);
    if (!merged.released) return;
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
    noteOn(pitch, 'key');
    ev.preventDefault();
  }

  function onKeyUp(ev) {
    var pitch = pitchForKey(ev.key);
    if (!pitch) return;
    ev.preventDefault();
    noteOff(pitch, 'key');
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
        if (!pitch) return;
        pointers[e.pointerId] = pitch;
        // Sonido en pointerdown, antes de preventDefault y del combate.
        noteOn(pitch, 'osk');
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      });
      function release(e) {
        var pitch = pointers[e.pointerId];
        if (!pitch) return;
        delete pointers[e.pointerId];
        noteOff(pitch, 'osk');
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
            if (cmd === 0x90 && vel > 0) noteOn(pitch, 'midi');
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(pitch, 'midi');
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

  function setMicStatus(text) {
    var el = $('micStatus');
    if (el) el.textContent = text || '';
  }

  function setMicButton(on) {
    var btn = $('btnMic');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('on', !!on);
    btn.textContent = on ? 'Micrófono: sí' : 'Micrófono';
  }

  function releaseMicNotes() {
    var pitches = Object.keys(heldKeys);
    var i;
    for (i = 0; i < pitches.length; i++) noteOff(pitches[i], 'mic');
    if (micTracker && window.MicNotes) MicNotes.reset(micTracker);
  }

  function stopMicGraph() {
    if (micTimer) {
      clearInterval(micTimer);
      micTimer = null;
    }
    try { if (micSource) micSource.disconnect(); } catch (e) {}
    try { if (micHp) micHp.disconnect(); } catch (e2) {}
    try { if (micAnalyser) micAnalyser.disconnect(); } catch (e3) {}
    try { if (micMute) micMute.disconnect(); } catch (e4) {}
    micSource = null;
    micHp = null;
    micAnalyser = null;
    micMute = null;
    micBuf = null;
    if (micStream) {
      micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e5) {} });
      micStream = null;
    }
    releaseMicNotes();
  }

  function micTick() {
    if (!micAnalyser || !micTracker || !micBuf || paused || !window.Pitch || !window.MicNotes) return;
    if (!audioCtx) return;
    try { micAnalyser.getFloatTimeDomainData(micBuf); } catch (e) { return; }
    var db = MicNotes.rmsDb(micBuf);
    var midi = null;
    var name = null;
    if (db >= MicNotes.GATE_DB) {
      var res = Pitch.detectPitch(micBuf, audioCtx.sampleRate || 48000, { maxLag: 420 });
      if (res && res.freq) {
        var note = Pitch.noteFromFreq(res.freq, 440);
        name = MicNotes.accept(note, res.clarity);
        if (name && note && MicNotes.isBlocked(synthBlocks, note.midi, performance.now())) name = null;
        if (name) midi = note.midi;
      }
    }
    var ev = MicNotes.hop(micTracker, { midi: name ? midi : null, name: name });
    if (ev.off) noteOff(ev.off, 'mic');
    if (ev.on) noteOn(ev.on, 'mic', { silent: true });
  }

  function attachMic(stream) {
    var ctx = getAudio();
    if (!ctx) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      micWanted = false;
      setMicButton(false);
      setMicStatus('Web Audio no está disponible; el micrófono no puede afinar.');
      preferSpeaker(false);
      return;
    }
    // Después del permiso: play-and-record reabre la ruta. El beep HTML
    // empuja el altavoz; si iOS igual usa el auricular, el aviso lo dice.
    preferSpeaker(true);
    if (ctx.state !== 'running') {
      try { ctx.resume(); } catch (e) {}
    }
    playSpeakerEl();
    micHp = ctx.createBiquadFilter();
    micHp.type = 'highpass';
    micHp.frequency.value = 70;
    micHp.Q.value = 0.707;
    micSource = ctx.createMediaStreamSource(stream);
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 2048;
    micAnalyser.smoothingTimeConstant = 0;
    micBuf = new Float32Array(micAnalyser.fftSize);
    micMute = ctx.createGain();
    micMute.gain.value = 0;
    micSource.connect(micHp);
    micHp.connect(micAnalyser);
    micAnalyser.connect(micMute);
    micMute.connect(ctx.destination);
    micStream = stream;
    micTracker = MicNotes.create();
    if (micTimer) clearInterval(micTimer);
    micTimer = setInterval(micTick, MicNotes.HOP_MS);
    setMicButton(true);
    setMicStatus(MicNotes.statusLine({ ios: iosLike() }));
  }

  function enableMic() {
    if (micStream || micPending) return;
    primeAudio();
    if (!window.MicNotes || !window.Pitch) {
      setMicStatus('Detección de notas no disponible.');
      setMicButton(false);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus(MicNotes.denyMessage('NotSupportedError'));
      setMicButton(false);
      return;
    }
    micWanted = true;
    micPending = true;
    setMicButton(true);
    setMicStatus('Pidiendo permiso del micrófono…');
    preferSpeaker(true);
    var audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
    navigator.mediaDevices.getUserMedia({ audio: audio }).then(function (stream) {
      micPending = false;
      if (!micWanted) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        return;
      }
      attachMic(stream);
    }).catch(function (err) {
      if (err && (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError')) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          micPending = false;
          if (!micWanted) {
            stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e2) {} });
            return;
          }
          attachMic(stream);
        }).catch(function (err2) {
          micPending = false;
          micWanted = false;
          setMicButton(false);
          preferSpeaker(false);
          setMicStatus(MicNotes.denyMessage(err2 && err2.name));
        });
        return;
      }
      micPending = false;
      micWanted = false;
      setMicButton(false);
      preferSpeaker(false);
      setMicStatus(MicNotes.denyMessage(err && err.name));
    });
  }

  function disableMic() {
    micWanted = false;
    micPending = false;
    stopMicGraph();
    setMicButton(false);
    preferSpeaker(false);
    if (audioCtx && !paused && !audioHeldForPause) {
      try { audioCtx.resume(); } catch (e) {}
      playSpeakerEl();
    }
    setMicStatus('');
  }

  function toggleMic() {
    if (tutorialOpen()) return;
    if (micStream || micPending) disableMic();
    else enableMic();
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
      setMic: function (on) { if (on) enableMic(); else disableMic(); },
      micOn: function () { return !!micStream; },
      audioSessionType: function () {
        return (navigator.audioSession && navigator.audioSession.type) || null;
      },
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

  function onGestureUnlock(ev) {
    if (paused || audioHeldForPause) return;
    // La tecla (OSK o QWERTY) agenda el tono ella misma. Si el desbloqueo
    // corre antes, en captura, el primer sample espera al beep.
    if (ev && ev.type === 'keydown' && pitchForKey(ev.key)) return;
    var t = ev && ev.target;
    if (t && t.closest && t.closest('#piano .key')) return;
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
    var btnMic = $('btnMic');
    if (btnMic) btnMic.addEventListener('click', toggleMic);

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

  try { primeWavUrl(); } catch (e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
