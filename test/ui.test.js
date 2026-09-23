// test/ui.test.js — v0.1.3: tutorial (escala), pentagrama, retrato único.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const Tutorial = require(path.join(root, 'js', 'ui', 'tutorial.js'));
const Tape = require(path.join(root, 'js', 'ui', 'tape.js'));

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

test('U3: versión 0.1.3, un retrato y pentagrama sin ficha de letras', () => {
  assert.strictEqual(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(), '0.1.3');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '0.1.3');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /boss-portrait\.png\?v=0\.1\.3/);
  assert.equal(html.includes('boss-cloud.png'), false);
  assert.equal(html.includes('0.1.2'), false);
  assert.match(html, /id="bossPortrait"/);
  const portraits = html.match(/id="bossPortrait"/g) || [];
  assert.strictEqual(portraits.length, 1);
  const tape = fs.readFileSync(path.join(root, 'js', 'ui', 'tape.js'), 'utf8');
  assert.equal(tape.includes('note-tile'), false);
  assert.match(tape, /improvNotes/);
  assert.match(tape, /treble-clef\.png/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'boss-portrait.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'ui', 'treble-clef.png')));
});
