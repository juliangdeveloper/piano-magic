'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const MidiInput = require('../js/instrument/midi-input.js');

const root = path.join(__dirname, '..');

function nativeEnv(webAccess, fail) {
  const posted = [];
  const env = {
    webkit: { messageHandlers: { nativeMidi: { postMessage(m) { if (fail) throw new Error('x'); posted.push(m); } } } },
    navigator: { requestMIDIAccess: () => { webAccess.called = true; return Promise.reject(new Error('web')); } }
  };
  return { env, posted, bridge: () => env[MidiInput.GLOBAL_NAME] };
}

function recorder() {
  const notes = [];
  const devices = [];
  return {
    notes,
    devices,
    onNote: (kind, note, velocity) => notes.push([kind, note, velocity]),
    onDevices: (n) => devices.push(n),
    onBlocked: () => devices.push('blocked'),
    onUnavailable: () => devices.push('none')
  };
}

test('MI1: parse reconoce note on, note off y note on con velocidad 0', () => {
  assert.deepStrictEqual(MidiInput.parse(0x90, 60, 100), { kind: 'on', note: 60, velocity: 100 });
  assert.deepStrictEqual(MidiInput.parse(0x93, 62, 0), { kind: 'off', note: 62, velocity: 0 });
  assert.deepStrictEqual(MidiInput.parse(0x80, 64, 40), { kind: 'off', note: 64, velocity: 40 });
  assert.deepStrictEqual(MidiInput.parse(0x90, 65), { kind: 'off', note: 65, velocity: 0 });
  assert.strictEqual(MidiInput.parse(0xb0, 64, 127), null);
});

test('MI2: en la app nativa el puente nativeMidi alimenta el mismo onNote y no se usa Web MIDI', () => {
  const web = { called: false };
  const rec = recorder();
  const n = nativeEnv(web);
  assert.strictEqual(MidiInput.start(rec, n.env), 'native');
  assert.deepStrictEqual(n.posted, [{ action: 'start' }]);
  const bridge = n.bridge();
  bridge.devices(1);
  bridge.emit({ status: 0x90, data1: 60, data2: 90, timestamp: 1 });
  bridge.emit({ status: 0x80, data1: 60, data2: 0, timestamp: 2 });
  bridge.emit({ status: 0xe0, data1: 0, data2: 64, timestamp: 3 });
  bridge.emit(null);
  bridge.devices(2);
  bridge.devices(0);
  assert.strictEqual(web.called, false);
  assert.deepStrictEqual(rec.notes, [['on', 60, 90], ['off', 60, 0]]);
  assert.deepStrictEqual(rec.devices, [1, 2, 0]);
});

test('MI3: en el navegador Web MIDI alimenta el mismo onNote y reengancha al conectar', async () => {
  const inputs = [{}];
  const access = { inputs, onstatechange: null };
  const rec = recorder();
  const env = { navigator: { requestMIDIAccess: () => Promise.resolve(access) } };
  assert.strictEqual(MidiInput.start(rec, env), 'web');
  await new Promise((r) => setImmediate(r));
  inputs[0].onmidimessage({ data: [0x90, 67, 80] });
  inputs[0].onmidimessage({ data: [0x90, 67, 0] });
  inputs[0].onmidimessage({ data: [0x90] });
  inputs.push({});
  access.onstatechange();
  inputs[1].onmidimessage({ data: [0x91, 48, 70] });
  assert.deepStrictEqual(rec.notes, [['on', 67, 80], ['off', 67, 0], ['on', 48, 70]]);
  assert.deepStrictEqual(rec.devices, [1, 2]);
});

test('MI4: sin MIDI o con permiso denegado avisa igual que antes', async () => {
  const none = recorder();
  assert.strictEqual(MidiInput.start(none, { navigator: {} }), 'none');
  assert.deepStrictEqual(none.devices, ['none']);
  const web = recorder();
  MidiInput.start(web, { navigator: { requestMIDIAccess: () => Promise.reject(new Error('x')) } });
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(web.devices, ['blocked']);
  const nat = recorder();
  MidiInput.start(nat, nativeEnv({}, true).env);
  assert.deepStrictEqual(nat.devices, ['blocked']);
  const denied = recorder();
  const n = nativeEnv({});
  MidiInput.start(denied, n.env);
  n.bridge().blocked();
  assert.deepStrictEqual(denied.devices, ['blocked']);
});

test('MI6: un webkit sin el manejador nativeMidi sigue usando Web MIDI', () => {
  const rec = recorder();
  const env = { webkit: { messageHandlers: {} }, navigator: { requestMIDIAccess: () => new Promise(() => {}) } };
  assert.strictEqual(MidiInput.start(rec, env), 'web');
  assert.strictEqual(env[MidiInput.GLOBAL_NAME], undefined);
});

test('MI5: index carga midi-input antes de app y app usa MidiInput', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(html, /js\/instrument\/midi-input\.js\?v=0\.2\.1/);
  assert.ok(html.indexOf('midi-input.js') < html.indexOf('js/app.js'));
  assert.match(app, /MidiInput\.start\(/);
  assert.doesNotMatch(app, /requestMIDIAccess/);
});
