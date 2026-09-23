// test/ui.test.js — v0.1.7: tutorial, pentagrama, pausa, ataques, fusión, mic, pulsos.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Tutorial = require(path.join(root, 'js', 'ui', 'tutorial.js'));
const Tape = require(path.join(root, 'js', 'ui', 'tape.js'));
const Hud = require(path.join(root, 'js', 'ui', 'hud.js'));

test('U1: el paso de sala dice escala y tempo, no elemento', () => {
  const sala = Tutorial.STEPS.find((s) => s.id === 'sala');
  assert.ok(sala);
  assert.match(sala.body, /escala y el tempo/);
  assert.equal(/elemento/.test(sala.body), false);
  assert.equal(/elemento y el tempo/.test(JSON.stringify(Tutorial.STEPS)), false);
});

test('U2: staffStep coloca C4 bajo el pentagrama y sube por la escala', () => {
  assert.strictEqual(Tape.staffStep('C4'), -2);
  assert.strictEqual(Tape.staffStep('D4'), -1);
  assert.strictEqual(Tape.staffStep('E4'), 0);
  assert.strictEqual(Tape.staffStep('F4'), 1);
  assert.strictEqual(Tape.staffStep('G4'), 2);
  assert.strictEqual(Tape.staffStep('A4'), 3);
  assert.strictEqual(Tape.staffStep('B4'), 4);
  assert.strictEqual(Tape.staffStep('C5'), 5);
  assert.strictEqual(Tape.staffStep('C#4'), -2);
  assert.strictEqual(Tape.staffStep('Eb4'), 0);
  assert.strictEqual(Tape.pitchParts('Eb4').acc, 'b');
  const order = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(Tape.staffStep(order[i]) > Tape.staffStep(order[i - 1]));
  }
  const sharp = Tape.pitchParts('F#4');
  assert.strictEqual(sharp.acc, '#');
  assert.strictEqual(sharp.step, Tape.staffStep('F4'));
});

test('U3: versión 0.1.7, un retrato y pentagrama sin ficha de letras', () => {
  assert.strictEqual(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), '0.1.7');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '0.1.7');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /boss-portrait\.png\?v=0\.1\.7/);
  assert.equal(html.includes('boss-cloud.png'), false);
  assert.equal(html.includes('0.1.2'), false);
  assert.equal(html.includes('0.1.3'), false);
  assert.equal(html.includes('0.1.4'), false);
  assert.equal(html.includes('0.1.5'), false);
  assert.equal(html.includes('0.1.6'), false);
  assert.match(html, /id="bossPortrait"/);
  const portraits = html.match(/id="bossPortrait"/g) || [];
  assert.strictEqual(portraits.length, 1);
  const tape = fs.readFileSync(path.join(root, 'js', 'ui', 'tape.js'), 'utf8');
  assert.equal(tape.includes('note-tile'), false);
  assert.match(tape, /improvNotes/);
  assert.match(tape, /defendNotes/);
  assert.match(tape, /treble-clef\.png/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'boss-portrait.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'treble-clef.png')));
});

test('U4: la cinta no lleva el marco decorativo detrás y el ataque se llama Ataque', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'ui.css'), 'utf8');
  assert.equal(/tape-frame\.png/.test(css), false);
  assert.strictEqual(Tape.KIND_LABEL.hole, 'ATAQUE');
  assert.strictEqual(Tape.KIND_LABEL.defend, 'DEFIENDE');
  assert.strictEqual(Hud.PHASE_LABEL.hole, 'Ataque');
  const ataque = Tutorial.STEPS.find((s) => s.id === 'hueco');
  assert.ok(ataque);
  assert.strictEqual(ataque.title, 'Ataque');
  assert.equal(/agujero|hueco/i.test(ataque.title + '\n' + ataque.body), false);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(/agujero|hueco/i.test(html), false);
  assert.match(html, /id="btnPause"/);
  assert.match(html, />Pausa</);
  assert.match(html, /id="pauseBanner"/);
  const hud = fs.readFileSync(path.join(root, 'js', 'ui', 'hud.js'), 'utf8');
  assert.equal(/agujero|hueco/i.test(hud), false);
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /primeAudio/);
  assert.match(app, /playChartMelody/);
  assert.match(app, /audioCtx\.suspend/);
});

test('U5: la fusión perfect es más fuerte que la parcial y el fallo no se funde', () => {
  const perfect = Tape.fuseVisual('perfect', 0);
  const partial = Tape.fuseVisual('partial', 0);
  const fail = Tape.fuseVisual('fail', 0.05);
  assert.ok(perfect.glow > partial.glow);
  assert.ok(perfect.sparkle > partial.sparkle);
  assert.ok(Tape.fuseVisual('perfect', 0.13).scale > Tape.fuseVisual('partial', 0.21).scale);
  assert.strictEqual(perfect.lerp, 0);
  assert.strictEqual(perfect.fused, false);
  assert.strictEqual(fail.miss, true);
  assert.strictEqual(fail.lerp, 0);
  assert.strictEqual(fail.sparkle, 0);
  assert.strictEqual(fail.fused, false);
  const mid = Tape.fuseVisual('perfect', 0.13);
  assert.ok(mid.lerp > 0 && mid.lerp < 1);
  assert.strictEqual(mid.showPlayer, true);
  const done = Tape.fuseVisual('perfect', 0.5);
  assert.strictEqual(done.fused, true);
  assert.strictEqual(done.sparkle, 0);
  assert.ok(done.glow < perfect.glow);
  const lateFail = Tape.fuseVisual('fail', 0.4);
  assert.strictEqual(lateFail.lerp, 0);
  assert.strictEqual(lateFail.fused, false);
});

test('U6: micrófono opcional, guía de pulso y audio de altavoz sin CDN', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="btnMic"/);
  assert.match(html, /Micrófono/);
  assert.match(html, /id="speakerUnlock"/);
  assert.match(html, /playsinline/);
  assert.match(html, /js\/pitch\.js\?v=0\.1\.7/);
  assert.match(html, /js\/instrument\/mic-notes\.js\?v=0\.1\.7/);
  assert.equal(/cdn|unpkg|jsdelivr|googleapis/i.test(html), false);
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /latencyHint/);
  assert.match(app, /play-and-record/);
  assert.match(app, /pointerdown/);
  assert.match(app, /getUserMedia/);
  assert.equal(/setTimeout\(kick/.test(app), false);
  const tape = fs.readFileSync(path.join(root, 'js', 'ui', 'tape.js'), 'utf8');
  assert.match(tape, /drawAttackGuide/);
  assert.match(tape, /attackBeatMarks/);
  assert.match(tape, /chartNoteBeat/);
  assert.match(app, /rafLoop/);
  assert.equal(/requestAnimationFrame\(render\)/.test(app), false);
  const css = fs.readFileSync(path.join(root, 'css', 'ui.css'), 'utf8');
  assert.match(css, /#btnMic\.on/);
});
