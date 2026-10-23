// js/app.js — cinta, HUD, tutorial, pausa, teclado y micrófono opcional.
// El motor de notas se carga en vivo desde piano-transcribe (engine/v1).
// Este juego solo lee las notas; el combate lo dibuja él. No hay copia local.
// Cada NoteOn (pantalla, QWERTY, MIDI) pasa por la sesión y suena.
// El mic usa session.hop. El hop ya fusiona, así que no vuelve a llamar a press.
// El AudioContext se desbloquea en el gesto: beep audible + audioSession playback,
// y el oscilador arranca en pointerdown sin esperar a resume().then().
'use strict';

(function () {
  var VERSION = '0.1.33';
  var ENGINE_ROOT = 'https://juliangdeveloper.github.io/piano-transcribe/engine/v1/';
  var ENGINE_FAIL = 'No se pudo cargar el motor de notas. El teclado y el MIDI siguen disponibles.';
  var RIVAL_KEY = 'pmRival';
  var chartCache = {};
  var rivalId = null;
  var lastPopSeq = 0;
  var KB_KEY = 'onscreenKeyboard';
  // El teclado en pantalla no se esconde. false vuelve a dejar que el botón lo oculte.
  var KEYBOARD_ALWAYS = true;
  var DETECT_FADE_MS = 280;

  var director = null;
  var fightChart = null;
  var progressCommitted = false;
  var tape = null;
  var hud = null;
  var bossSprite = null;
  var bossPreviewOn = false;
  var bossPreviewRaf = 0;
  var tutorial = null;
  var audioCtx = null;
  var masterGain = null;
  var analyser = null;
  var peakBuf = null;
  var audioUnlocked = false;
  var audioHeldForPause = false;
  var runningLoop = false;
  var lastPaintMs = 0;
  var paused = false;
  var lastClickBeat = -1;
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
  var micSilentTicks = 0;
  var micRewires = 0;
  var engine = null;
  var session = null;
  var engineState = 'loading';
  var localHeld = {};
  var playerFadeTimers = {};

  function $(id) { return document.getElementById(id); }

  function showError(msg) {
    var box = $('error');
    if (!box) return;
    box.textContent = msg;
    box.className = 'visible';
  }

  // Carga genérica del motor publicado. version.txt sin caché, luego el módulo.
  // Si esa petición falla, reintenta con la última versión que sí cargó.
  function loadPianoEngine(root) {
    return fetch(root + 'version.txt?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('version');
        return res.text();
      })
      .then(function (text) {
        var version = text.trim();
        try { localStorage.setItem('piano-transcribe.engine', version); } catch (e) {}
        return import(root + 'capture.js?v=' + encodeURIComponent(version));
      })
      .catch(function () {
        var version = '';
        try { version = localStorage.getItem('piano-transcribe.engine') || ''; } catch (e) {}
        return import(root + 'capture.js' + (version ? ('?v=' + encodeURIComponent(version)) : ''));
      })
      .then(function (mod) {
        if (!mod || mod.INTERFACE !== 1 || typeof mod.createCapture !== 'function') {
          throw new Error('interface');
        }
        return mod;
      });
  }

  function canonicalPitch(pitch) {
    if (pitch == null || pitch === '') return null;
    if (window.InstrumentTranslator && InstrumentTranslator.normalizeName) {
      return InstrumentTranslator.normalizeName(pitch);
    }
    return String(pitch);
  }

  // Solo teclado, teclado en pantalla y MIDI si el motor no llega.
  function localPress(pitch, source) {
    var slot = localHeld[pitch];
    var fresh = !slot;
    if (!slot) {
      slot = {};
      localHeld[pitch] = slot;
    }
    var added = !slot[source];
    slot[source] = true;
    return {
      pitch: pitch,
      fresh: fresh,
      sound: added && source !== 'mic',
      combat: fresh,
      released: false
    };
  }

  function localRelease(pitch, source) {
    var slot = localHeld[pitch];
    if (!slot) return { pitch: pitch, released: false };
    if (source) delete slot[source];
    else {
      delete localHeld[pitch];
      return { pitch: pitch, released: true };
    }
    var left = 0;
    var k;
    for (k in slot) {
      if (Object.prototype.hasOwnProperty.call(slot, k)) left += 1;
    }
    if (left) return { pitch: pitch, released: false };
    delete localHeld[pitch];
    return { pitch: pitch, released: true };
  }

  function adoptLocalHeld() {
    if (!session) return;
    var names = Object.keys(localHeld);
    var i;
    var k;
    var slot;
    var pack;
    var ev;
    var next;
    for (i = 0; i < names.length; i++) {
      slot = localHeld[names[i]];
      next = {};
      for (k in slot) {
        if (!Object.prototype.hasOwnProperty.call(slot, k) || !slot[k]) continue;
        pack = session.press(names[i], k, performance.now());
        ev = pack && pack.events && pack.events[0];
        if (!ev) next[k] = true;
      }
      if (Object.keys(next).length) localHeld[names[i]] = next;
      else delete localHeld[names[i]];
    }
  }

  function pressHeld(pitch, source) {
    if (session) {
      var pack = session.press(pitch, source, performance.now());
      var ev = pack && pack.events && pack.events[0];
      if (ev) return ev;
      return { pitch: pitch, fresh: false, sound: false, combat: false, released: false };
    }
    return localPress(pitch, source);
  }

  function releaseHeldNote(pitch, source) {
    var ev = null;
    if (session) {
      var pack = session.release(pitch, source, performance.now());
      ev = pack && pack.events && pack.events[0];
    }
    if (localHeld[pitch]) {
      var local = localRelease(pitch, source);
      if (local.released && (!ev || !ev.released)) return local;
    }
    if (ev) return ev;
    return { pitch: pitch, released: false };
  }

  function applyEngineEvents(pack) {
    var events = (pack && pack.events) || [];
    var i;
    var ev;
    for (i = 0; i < events.length; i++) {
      ev = events[i];
      if (!ev || !ev.pitch) continue;
      if (ev.type === 'on') noteOn(ev.pitch, ev.source || 'mic', { silent: true, merged: ev });
      else noteOff(ev.pitch, ev.source || 'mic', ev);
    }
  }

  function showEngineFailure() {
    engineState = 'failed';
    engine = null;
    session = null;
    if (!micStream) {
      micWanted = false;
      micPending = false;
      setMicButton(false);
    }
    showError(ENGINE_FAIL);
    setMicStatus(ENGINE_FAIL);
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
    var audioSession = (typeof navigator !== 'undefined') ? navigator.audioSession : null;
    if (!audioSession) return false;
    try {
      audioSession.type = (engine && engine.sessionType)
        ? engine.sessionType(!!micOn)
        : (micOn ? 'play-and-record' : 'playback');
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
    if (!engine || !freq) return;
    var note = engine.noteFromFreq(freq, 440);
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
      gain: strong ? (0.01545 * 0.045 / 0.028) : 0.01545,
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
        abs = Chart.hitOnset(bar.startBeat + note.beat);
        if (abs <= from || abs > to + 1e-4) continue;
        id = bar.globalBar + ':' + note.beat + ':' + note.pitch;
        if (bossHeard[id]) continue;
        bossHeard[id] = true;
        playPitch(note.pitch, {
          role: 'boss',
          gain: 0.236,
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
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Continuar' : 'Pausa');
      btn.title = on ? 'Continuar' : 'Pausa';
      btn.classList.toggle('on', !!on);
    }
    if (banner) banner.classList.toggle('visible', !!on);
    var rb = $('btnPauseRestart');
    if (rb) rb.hidden = !(on && visible);
    var rv = $('btnPauseRival');
    if (rv) rv.hidden = !(on && visible);
  }

  function releaseHeld() {
    var seen = {};
    var i;
    var ev;
    var name;
    if (session) {
      var pack = session.reset(performance.now());
      var events = (pack && pack.events) || [];
      for (i = 0; i < events.length; i++) {
        ev = events[i];
        if (!ev || !ev.pitch || seen[ev.pitch]) continue;
        seen[ev.pitch] = true;
        markKey(ev.pitch, false);
        if (director) director.noteOff(ev.pitch, performance.now());
      }
    }
    var names = Object.keys(localHeld);
    for (i = 0; i < names.length; i++) {
      name = names[i];
      if (seen[name]) continue;
      markKey(name, false);
      if (director) director.noteOff(name, performance.now());
    }
    localHeld = {};
  }

  function render() {
    if (!director || !runningLoop) return;
    lastPaintMs = performance.now();
    var state = director.tick(lastPaintMs);
    if (tape) tape.render(state);
    if (hud) hud.render(state);
    if (bossSprite && document.body.classList.contains('sprite-boss')) {
      bossSprite.paint(state.beat, window.BossAnim.attackHits(state.ribbon), state.beatsPerBar);
    }
    if (state.free) showDamagePop(state.damage);
    playChartMelody(state);
    paintKeyLights(state);

    if (state.running && !state.paused) {
      // El clic cae en el centro del tiempo, junto a la marca y a la nota.
      var slot = Chart.centerReached(state.beat);
      if (slot !== lastClickBeat && slot >= 0) {
        lastClickBeat = slot;
        if (!micStream) metronomeClick((slot % (state.beatsPerBar || 4)) === 0);
      }
    }

    if (state.ended) {
      showOutcome(state);
      stopLoop();
    }
  }

  function rafLoop() {
    if (!runningLoop) return;
    render();
    if (runningLoop) requestAnimationFrame(rafLoop);
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
    if (state && !state.free && !progressCommitted) {
      progressCommitted = true;
      try {
        if (window.Progress) Progress.recordFight(fightChart, state, VERSION);
      } catch (eProg) {}
    }
    if (!overlay || !msg) return;
    overlay.className = 'visible';
    var os = $('overlayStats');
    if (os) {
      var d = state.damage || {};
      os.hidden = !(d.hits > 0);
      os.textContent = (d.total || 0) + ' · ' + (d.max || 0) + ' · ' + (d.dps || 0);
      os.setAttribute('aria-label', 'Daño total ' + (d.total || 0) + ' · Máx ' + (d.max || 0) + ' · DPS ' + (d.dps || 0));
    }
    if (state.outcome === 'win') {
      msg.textContent = '✓';
      msg.className = 'win';
      msg.setAttribute('aria-label', 'Victoria');
    } else {
      msg.textContent = '✕';
      msg.className = 'lose';
      msg.setAttribute('aria-label', 'Derrota');
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
    progressCommitted = false;
    paused = false;
    audioHeldForPause = false;
    unmuteMaster();
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
    stopBossPreview();
    setPauseUi(false, true);
    $('btnStart').className = 'hidden';
    setPickerVisible(false);
    lastPopSeq = 0;
    clearPops();
    lastPaintMs = performance.now();
    // Un solo rAF. El interval no abre otra cadena: solo recupera
    // un frame si el anterior se atrasó (pestaña oculta). Si cada
    // tick volviera a pedir un rAF, al llegar a Defiende la cinta
    // se atasca y el reloj da tirones.
    tickTimer = setInterval(function () {
      if (!runningLoop) return;
      if (performance.now() - lastPaintMs > 80) render();
    }, 50);
    requestAnimationFrame(rafLoop);
  }

  // v0.1.8: reiniciar no debe dejar el micrófono mudo. Si la pista murió
  // (iOS la corta al cambiar la sesión de audio) se reabre sola; si sigue
  // viva se reanuda el AudioContext y se rearma el intervalo de lectura.
  // v0.1.10: solo una pista 'ended' está muerta; 'muted' es transitorio en iOS
  // (antes se cerraba y se volvía a pedir el mic, y a veces no volvía).
  function micTrackAlive() {
    if (!micStream) return false;
    var tr = micStream.getAudioTracks ? micStream.getAudioTracks() : [];
    if (!tr.length) return false;
    for (var i = 0; i < tr.length; i++) {
      if (tr[i].readyState === 'ended') return false;
    }
    return true;
  }

  // Rehace el MediaStreamSource sobre la misma pista (no pide permiso otra vez).
  function rewireMic() {
    var ctx = audioCtx;
    if (!ctx || !micStream || !micHp) return false;
    try { if (micSource) micSource.disconnect(); } catch (e) {}
    try {
      micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(micHp);
    } catch (e2) { return false; }
    micSilentTicks = 0;
    return true;
  }

  function ensureMic() {
    if (!micWanted || micPending) return;
    if (!engine || !session) return;
    if (!micStream || !micAnalyser || !micTrackAlive()) {
      stopMicGraph();
      micWanted = true;
      enableMic();
      return;
    }
    if (audioCtx && audioCtx.state !== 'running') {
      try { audioCtx.resume(); } catch (e) {}
    }
    rewireMic();
    micRewires = 0;
    if (session) applyEngineEvents(session.releaseSource('mic', performance.now()));
    if (micTimer) clearInterval(micTimer);
    micTimer = setInterval(micTick, engine.HOP_MS);
  }

  function restartFight() {
    if (!director || tutorialOpen()) return;
    director.reset();
    startFight();
    ensureMic();
  }

  function pauseFight() {
    if (!director || !runningLoop || paused) return;
    var state = director.snapshot(performance.now());
    if (state.ended) return;
    releaseHeld();
    director.pause(performance.now());
    paused = true;
    if (audioCtx && micStream) {
      // v0.1.10: con micrófono no se suspende el AudioContext. En Safari
      // (iPad/iPhone) suspender y reanudar deja el MediaStreamSource entregando
      // silencio: era la causa de que el mic dejara de oír tras Pausa→Reiniciar.
      audioHeldForPause = true;
      if (masterGain) masterGain.gain.value = 0;
    } else if (audioCtx && audioCtx.state === 'running') {
      audioHeldForPause = true;
      try { audioCtx.suspend(); } catch (e) {}
    }
    setPauseUi(true, true);
    if (tape) tape.render(director.snapshot(performance.now()));
    if (hud) hud.render(director.snapshot(performance.now()));
  }

  function unmuteMaster() {
    if (masterGain) masterGain.gain.value = 0.92;
  }

  function resumeFight() {
    if (!director || !paused) return;
    audioHeldForPause = false;
    unmuteMaster();
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
    if (paused || !pitch) return;
    pitch = canonicalPitch(pitch);
    if (!pitch) return;
    // El hop del mic ya fusionó. Volver a press contaría la nota dos veces.
    var merged = opts.merged || null;
    if (!merged) {
      if (source === 'mic') return;
      merged = pressHeld(pitch, source);
    }
    var name = merged.pitch || pitch;
    if (merged.sound && !opts.silent) playPitch(name);
    markKey(name, true, source);
    if (!merged.fresh) return;
    // El tutorial puede sonar (desbloquea el audio) pero no entra al combate.
    if (tutorialOpen()) return;
    if (merged.combat && director) director.noteOn(name, performance.now(), merged.voices);
  }

  function noteOff(pitch, source, precomputed) {
    if (!pitch) return;
    pitch = canonicalPitch(pitch);
    if (!pitch) return;
    source = source || 'key';
    var merged = precomputed || null;
    if (!merged) {
      if (source === 'mic') return;
      merged = releaseHeldNote(pitch, source);
    }
    if (!merged.released) return;
    var name = merged.pitch || pitch;
    markKey(name, false, source);
    if (director) director.noteOff(name, performance.now());
  }

  function keyButton(pitch) {
    return document.querySelector('#piano .key[data-pitch="' + pitch + '"]');
  }

  function markKey(pitch, down, source) {
    var btn = keyButton(pitch);
    if (!btn) return;
    if (playerFadeTimers[pitch]) {
      clearTimeout(playerFadeTimers[pitch]);
      delete playerFadeTimers[pitch];
    }
    if (down) {
      btn.classList.add('lit-player');
      btn.classList.remove('lit-fade');
      return;
    }
    if (source === 'mic') {
      btn.classList.add('lit-fade');
      playerFadeTimers[pitch] = setTimeout(function () {
        btn.classList.remove('lit-player', 'lit-fade');
        delete playerFadeTimers[pitch];
      }, DETECT_FADE_MS);
      return;
    }
    btn.classList.remove('lit-player', 'lit-fade');
  }

  function paintKeyLights(state) {
    var on = {};
    var list = (window.Chart && state) ? Chart.activePitches(state.ribbon, state.beat) : [];
    var i;
    var name;
    var keys;
    var pitch;
    for (i = 0; i < list.length; i++) {
      name = canonicalPitch(list[i]);
      if (name) on[name] = true;
    }
    keys = document.querySelectorAll('#piano .key');
    for (i = 0; i < keys.length; i++) {
      pitch = keys[i].getAttribute('data-pitch');
      keys[i].classList.toggle('lit-enemy', !!on[pitch]);
    }
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

  function buildPiano() {
    var piano = $('piano');
    if (!piano || !window.InstrumentTranslator) return;
    piano.textContent = '';
    var labels = InstrumentTranslator.KEY_LABELS;
    // C3–A5. Las blancas salen en el orden de KEY_LABELS; las negras se ubican por la blanca de abajo.
    function isBlack(it) { return /[#b]/.test(it.pitch.replace(/^[A-G]/, '').replace(/\d+$/, '')); }
    var whites = labels.filter(function (it) { return !isBlack(it); });
    var W = whites.length || 1;
    var blackW = 100 / W * 0.62;
    function whiteIndexBelow(it) {
      var m = InstrumentTranslator.pitchToMidi(it.pitch) - 1;
      for (var q = 0; q < whites.length; q++) if (InstrumentTranslator.pitchToMidi(whites[q].pitch) === m) return q;
      return 0;
    }
    for (var i = 0; i < labels.length; i++) {
      var item = labels[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      var blk = isBlack(item);
      btn.className = 'key ' + (blk ? 'black' : 'white');
      if (blk) {
        btn.style.width = blackW + '%';
        btn.style.left = ((whiteIndexBelow(item) + 1) * 100 / W - blackW / 2) + '%';
      }
      btn.setAttribute('data-key', item.key.toLowerCase());
      var pitch = pitchForKey(item.key);
      if (pitch) btn.setAttribute('data-pitch', pitch);
      btn.setAttribute('aria-label', pitch || item.pitch);
      var enemy = document.createElement('span');
      enemy.className = 'glow enemy';
      enemy.setAttribute('aria-hidden', 'true');
      var playerGlow = document.createElement('span');
      playerGlow.className = 'glow player';
      playerGlow.setAttribute('aria-hidden', 'true');
      btn.appendChild(enemy);
      btn.appendChild(playerGlow);
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
    if (KEYBOARD_ALWAYS) on = true;
    var dock = $('keys');
    if (dock) dock.hidden = !on;
    document.body.classList.toggle('kb-on', !!on);
    var btn = $('btnKeyboard');
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('on', !!on);
    }
    if (persist && !KEYBOARD_ALWAYS) {
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

  var micHeardUntil = 0;

  function bufLevel(buf) {
    if (!buf || !buf.length) return 0;
    var sum = 0;
    var n = 0;
    var i;
    for (i = 0; i < buf.length; i += 8) {
      sum += buf[i] * buf[i];
      n++;
    }
    var rms = Math.sqrt(sum / (n || 1));
    var db = 20 * Math.log10(rms + 1e-9);
    var t = (db + 58) / 46;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t;
  }

  function updateMicHeard(reading, level) {
    var fill = $('micMeterFill');
    var note = $('micNote');
    if (fill && typeof level === 'number') fill.style.height = Math.round(level * 100) + '%';
    if (!note) return;
    var pitch = '';
    if (reading && reading.pitch && (reading.accepted || reading.midi != null)) {
      pitch = String(reading.pitch);
      micHeardUntil = performance.now() + 360;
    } else if (performance.now() < micHeardUntil && note.textContent) {
      return;
    }
    note.textContent = pitch;
  }

  function setMicLive(on) {
    var live = $('micLive');
    if (live) live.hidden = !on;
    if (!on) {
      micHeardUntil = 0;
      updateMicHeard(null, 0);
    }
  }

  function setMicButton(on) {
    var btn = $('btnMic');
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('on', !!on);
    setMicLive(!!on);
  }

  function releaseMicNotes() {
    if (!session) return;
    applyEngineEvents(session.releaseSource('mic', performance.now()));
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
    if (!micAnalyser || !session || !engine || !micBuf || paused) return;
    if (!audioCtx) return;
    if (audioCtx.state !== 'running' && !audioHeldForPause) {
      try { audioCtx.resume(); } catch (e0) {}
    }
    try { micAnalyser.getFloatTimeDomainData(micBuf); } catch (e) { return; }
    // Vigía: un mic real nunca da ceros exactos. ~0.6 s de ceros = la fuente
    // quedó muda (Safari); se rehace, y si no basta se reabre el micrófono.
    var allZero = true;
    for (var zi = 0; zi < micBuf.length; zi += 16) { if (micBuf[zi] !== 0) { allZero = false; break; } }
    if (allZero && audioCtx.state === 'running') {
      micSilentTicks += 1;
      if (micSilentTicks > 30) {
        micSilentTicks = 0;
        micRewires += 1;
        if (micRewires <= 2 && micTrackAlive()) rewireMic();
        else { micRewires = 0; stopMicGraph(); micWanted = true; enableMic(); }
      }
      updateMicHeard(null, 0);
      return;
    }
    micSilentTicks = 0;
    micRewires = 0;
    // Mismo hop de 20 ms. El motor mide, vota y fusiona; aquí solo se leen las notas.
    var out = session.hop(micBuf, audioCtx.sampleRate || 48000, performance.now(), {
      blocked: synthBlocks
    });
    applyEngineEvents(out);
    updateMicHeard(out && out.reading, bufLevel(micBuf));
  }

  function attachMic(stream) {
    var ctx = getAudio();
    if (!ctx) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      micWanted = false;
      setMicButton(false);
      setMicStatus('Web Audio no está disponible; el micrófono no puede afinar.');
      showError('Web Audio no está disponible; el micrófono no puede afinar.');
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
    micHp.frequency.value = 90;
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
    if (micTimer) clearInterval(micTimer);
    micTimer = setInterval(micTick, engine.HOP_MS);
    setMicButton(true);
    setMicStatus(engine.statusLine({ ios: iosLike() }));
    var errBox = $('error');
    if (errBox && errBox.textContent !== ENGINE_FAIL) {
      errBox.textContent = '';
      errBox.className = '';
    }
  }

  function enableMic() {
    if (micStream || micPending) return;
    primeAudio();
    if (engineState === 'loading') {
      micWanted = true;
      setMicButton(true);
      setMicStatus('Cargando el motor de notas…');
      return;
    }
    if (!engine || !session) {
      micWanted = false;
      setMicButton(false);
      setMicStatus(ENGINE_FAIL);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicStatus(engine.denyMessage('NotSupportedError'));
      showError(engine.denyMessage('NotSupportedError'));
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
          setMicStatus(engine.denyMessage(err2 && err2.name));
          showError(engine.denyMessage(err2 && err2.name));
        });
        return;
      }
      micPending = false;
      micWanted = false;
      setMicButton(false);
      preferSpeaker(false);
      setMicStatus(engine.denyMessage(err && err.name));
      showError(engine.denyMessage(err && err.name));
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
    if (micStream || micPending || micWanted) disableMic();
    else enableMic();
  }

  // v0.1.9: rival elegible + Modo libre.
  function readRival() {
    try { return localStorage.getItem(RIVAL_KEY); } catch (e) { return null; }
  }

  function loadChart(url) {
    if (chartCache[url]) return Promise.resolve(chartCache[url]);
    return fetch(url + '?v=' + VERSION).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (j) { chartCache[url] = j; return j; });
  }

  function chartForRival(opt) {
    return loadChart(opt.chart).then(function (raw) {
      return opt.free ? Rivals.freeChart(raw) : raw;
    });
  }

  function makeDirector(chart, opt) {
    fightChart = chart;
    director = CombatDirector.create({
      chart: chart,
      free: !!(opt && opt.free),
      now: function () { return performance.now(); }
    });
    if (window.PianoMagic) window.PianoMagic.director = director;
    document.body.setAttribute('data-rival', (opt && opt.id) || chart.id || '');
    setBossVisual(opt || Rivals.find(chart.id));
  }

  function stopBossPreview() {
    bossPreviewOn = false;
    if (bossPreviewRaf) {
      cancelAnimationFrame(bossPreviewRaf);
      bossPreviewRaf = 0;
    }
  }

  function bossPreviewLoop() {
    var snap;
    var bpm;
    var beat;
    var bpb;
    bossPreviewRaf = 0;
    if (!bossPreviewOn || runningLoop) return;
    bpm = 72;
    bpb = 4;
    if (director) {
      snap = director.snapshot(0);
      if (snap && snap.bpm) bpm = snap.bpm;
      if (snap && snap.beatsPerBar) bpb = snap.beatsPerBar;
    }
    beat = (performance.now() / 1000) * (bpm / 60);
    if (!bossPreviewOn || runningLoop) return;
    if (bossSprite) bossSprite.paint(beat, [], bpb);
    if (!bossPreviewOn || runningLoop) return;
    bossPreviewRaf = requestAnimationFrame(bossPreviewLoop);
  }

  function startBossPreview() {
    if (runningLoop || !document.body.classList.contains('sprite-boss')) {
      stopBossPreview();
      return;
    }
    if (bossPreviewOn) return;
    bossPreviewOn = true;
    bossPreviewRaf = requestAnimationFrame(bossPreviewLoop);
  }

  function applyBossPortrait(opt, own) {
    var img = $('bossPortrait');
    var canvas = $('bossSprite');
    document.body.classList.remove('sprite-boss');
    stopBossPreview();
    if (canvas) canvas.hidden = true;
    if (!img) return;
    img.hidden = false;
    if (own && opt && opt.portrait) {
      img.src = opt.portrait + '?v=' + VERSION;
      img.style.filter = '';
    } else {
      img.src = 'assets/ui/boss-portrait.png?v=' + VERSION;
      img.style.filter = (opt && opt.hue)
        ? (opt.hue + ' drop-shadow(0 10px 16px rgba(0, 0, 0, 0.35))')
        : '';
    }
  }

  function showBossSprite() {
    var img = $('bossPortrait');
    var canvas = $('bossSprite');
    document.body.classList.add('sprite-boss');
    if (canvas) canvas.hidden = false;
    if (img) img.hidden = true;
    if (!runningLoop) startBossPreview();
  }

  function setBossVisual(opt) {
    if (typeof opt === 'string') opt = Rivals.find(opt);
    opt = opt || {};
    var sheet = (!opt.free && opt.sprite) || null;
    var timings = (!opt.free && opt.timings) || null;
    if (bossSprite) bossSprite.cancel();
    if (!sheet || !timings || !bossSprite) {
      applyBossPortrait(opt, false);
      return;
    }
    applyBossPortrait(opt, true);
    bossSprite.load(sheet + '?v=' + VERSION, timings + '?v=' + VERSION);
  }

  function setPickerVisible(on) {
    var pk = $('rivalPicker');
    if (pk) pk.hidden = !on;
    document.body.classList.toggle('picking', !!on);
  }

  function buildPicker() {
    var pk = $('rivalPicker');
    if (!pk) return;
    pk.textContent = '';
    Rivals.options().forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rival-opt' + (o.free ? ' free' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('data-rival', o.id);
      b.setAttribute('aria-checked', o.id === rivalId ? 'true' : 'false');
      b.setAttribute('aria-label', o.label);
      b.title = o.label;
      if (o.free) {
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5v9M7.5 12h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      } else {
        var img = document.createElement('img');
        img.alt = '';
        if (o.portrait) {
          img.className = 'portrait';
          img.src = o.portrait + '?v=' + VERSION;
        } else {
          img.src = 'assets/ui/boss-portrait.png?v=' + VERSION;
          if (o.hue) img.style.filter = o.hue;
        }
        b.appendChild(img);
      }
      b.addEventListener('click', function () { selectRival(o.id); });
      pk.appendChild(b);
    });
  }

  function markPicker() {
    var bs = document.querySelectorAll('#rivalPicker .rival-opt');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-checked', bs[i].getAttribute('data-rival') === rivalId ? 'true' : 'false');
    }
  }

  function renderIdle() {
    if (!director) return;
    var idle = director.snapshot(0);
    if (hud) hud.render(idle);
    if (tape) tape.render(idle);
  }

  function selectRival(id) {
    if (tutorialOpen()) return Promise.resolve();
    if (runningLoop && director && !director.snapshot(performance.now()).ended) return Promise.resolve();
    var opt = Rivals.find(id);
    rivalId = opt.id;
    try { localStorage.setItem(RIVAL_KEY, rivalId); } catch (e) {}
    markPicker();
    return chartForRival(opt).then(function (chart) {
      if (opt.id !== rivalId) return;
      makeDirector(chart, opt);
      renderIdle();
    }).catch(function (err) {
      showError('No se pudo cargar el rival — ' + err.message);
    });
  }

  // Desde pausa o desde el fin: vuelve a la pantalla de elegir rival.
  function backToPicker() {
    if (!director || tutorialOpen()) return;
    releaseHeld();
    stopLoop();
    if (audioHeldForPause && audioCtx) {
      try { audioCtx.resume(); } catch (e) {}
    }
    paused = false;
    audioHeldForPause = false;
    unmuteMaster();
    director.reset();
    hideOutcome();
    setPauseUi(false, false);
    clearPops();
    $('btnStart').className = '';
    setPickerVisible(true);
    renderIdle();
    if (document.body.classList.contains('sprite-boss')) startBossPreview();
    ensureMic();
  }

  function clearPops() {
    var box = $('dmgPops');
    if (box) box.textContent = '';
  }

  function showDamagePop(d) {
    if (!d || !d.seq || d.seq === lastPopSeq) return;
    lastPopSeq = d.seq;
    var box = $('dmgPops');
    if (!box) return;
    var n = document.createElement('span');
    n.className = 'dmg-pop' + (d.last >= d.max && d.hits > 1 ? ' big' : '');
    n.textContent = '−' + d.last;
    box.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 1200);
  }

  function boot(chart, opt) {
    if (!bossSprite && window.BossAnim) {
      bossSprite = BossAnim.create($('bossSprite'), {
        onReady: showBossSprite,
        onError: function () {
          var canvas = $('bossSprite');
          document.body.classList.remove('sprite-boss');
          if (canvas) canvas.hidden = true;
          var img = $('bossPortrait');
          if (img) img.hidden = false;
          stopBossPreview();
        }
      });
    }
    makeDirector(chart, opt);
    tape = Tape.create($('tape'), { version: VERSION });
    hud = Hud.create();
    buildPicker();
    setPickerVisible(true);
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
      selectRival: selectRival,
      rival: function () { return rivalId; },
      backToPicker: backToPicker,
      pause: pauseFight,
      resume: resumeFight,
      togglePause: togglePause,
      isPaused: function () { return paused; },
      noteOn: noteOn,
      noteOff: noteOff,
      tutorial: tutorial,
      setKeyboard: function (on) { applyKeyboard(!!on, true); },
      keyboardOn: function () { return !$('keys').hidden; },
      bossFrame: function () { return bossSprite && bossSprite.current ? bossSprite.current() : null; },
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
    try { if (window.Progress) Progress.backfill(VERSION); } catch (eBf) {}
    try {
      var flushProgress = function () {
        try { if (window.Progress) Progress.flush(); } catch (eFl) {}
      };
      window.addEventListener('pagehide', flushProgress);
      window.addEventListener('unload', flushProgress);
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.visibilityState === 'hidden') flushProgress();
        } catch (eVis) {}
      });
    } catch (ePh) {}
    buildPiano();
    bindOnscreenKeys();
    applyKeyboard(KEYBOARD_ALWAYS || readKeyboardPref(), false);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onGestureUnlock, true);
    document.addEventListener('touchend', onGestureUnlock, true);
    document.addEventListener('keydown', onGestureUnlock, true);
    $('btnStart').addEventListener('click', startFight);
    $('btnRestart').addEventListener('click', restartFight);
    if ($('btnPauseRestart')) $('btnPauseRestart').addEventListener('click', restartFight);
    $('btnPause').addEventListener('click', togglePause);
    if ($('btnPauseRival')) $('btnPauseRival').addEventListener('click', backToPicker);
    if ($('btnOverlayRival')) $('btnOverlayRival').addEventListener('click', backToPicker);
    $('btnKeyboard').addEventListener('click', function () {
      if (tutorialOpen()) return;
      applyKeyboard($('keys').hidden, true);
    });
    // v0.1.10: la cinta se ajusta al girar o al cambiar las barras de Safari.
    window.addEventListener('resize', function () {
      requestAnimationFrame(function () {
        refreshTape();
        if (bossSprite) bossSprite.repaint();
      });
    });
    window.addEventListener('orientationchange', function () { setTimeout(refreshTape, 250); });
    if (window.ResizeObserver && $('tapeFrame')) {
      try { new ResizeObserver(function () { refreshTape(); }).observe($('tapeFrame')); } catch (eRo) {}
    }
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

    var opt0 = Rivals.find(readRival());
    rivalId = opt0.id;
    chartForRival(opt0).then(function (chart) { boot(chart, opt0); }).catch(function (err) {
      showError('No se pudo cargar el chart. Sirve la carpeta con un servidor estático (python -m http.server) — ' + err.message);
      maybeTutorial();
    });
  }

  try { primeWavUrl(); } catch (e) {}

  loadPianoEngine(ENGINE_ROOT).then(function (mod) {
    engine = mod;
    session = mod.createCapture({ profile: 'combat', maxVoices: 2 });
    engineState = 'ready';
    adoptLocalHeld();
    if (micWanted && !micStream && !micPending) enableMic();
  }).catch(function () {
    engineState = 'failed';
    engine = null;
    session = null;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showEngineFailure);
    } else {
      showEngineFailure();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
