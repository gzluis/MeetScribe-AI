'use strict';
// Regresión: Manifest V3 permite solamente chrome.runtime en el documento offscreen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const offscreenSource = fs.readFileSync(path.join(root, 'offscreen.js'), 'utf8');
assert.doesNotMatch(offscreenSource, /chrome\\.storage\\.(local|sync|session)/,
  'El documento offscreen no debe llamar chrome.storage');

async function main() {
  const handlers = [];
  const data = {capture: {active: false}, sessions: []};
  const storage = {
    async get(keys) {
      const list = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(list.map(key => [key, data[key]]));
    },
    async set(patch) { Object.assign(data, patch); }
  };
  const workerChrome = {
    action: {onClicked: {addListener() {}}},
    runtime: {onMessage: {addListener(fn) { handlers.push(fn); }}},
    storage: {local: storage}
  };
  vm.runInNewContext(workerSource, {chrome: workerChrome, console}, {filename: 'background.js'});

  function sendWorker(message) {
    return new Promise((resolve, reject) => {
      let found = false;
      for (const listener of handlers) {
        const result = listener(message, {}, resolve);
        if (result === true) { found = true; break; }
      }
      if (!found) reject(new Error('Sin manejador de mensajes en el service worker'));
    });
  }

  const offscreenListeners = [];
  const offscreenChrome = {
    runtime: {
      onMessage: {addListener(fn) { offscreenListeners.push(fn); }},
      sendMessage: sendWorker,
      getURL(file) { return 'chrome-extension://prueba/' + file; }
    }
    // Deliberadamente SIN chrome.storage, igual que un documento offscreen real.
  };
  vm.runInNewContext(offscreenSource, {
    chrome: offscreenChrome,
    navigator: {mediaDevices: {getUserMedia: () => new Promise(() => {})}},
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    WebSocket: class {},
    AudioContext: class {},
    Date,
    Promise
  }, {filename: 'offscreen.js'});
  assert.equal(offscreenListeners.length, 1);

  // START debe confirmar recepción sin esperar a getUserMedia.
  let accepted = null;
  const returned = offscreenListeners[0]({
    target: 'offscreen', type: 'START', sessionId: 's1',
    title: 'Prueba local', streamId: 'stream1', token: 'token-prueba'
  }, {}, value => { accepted = value; });
  assert.equal(returned, false);
  assert.equal(accepted?.ok, true);

  // El inicio debe transferir el estado al service worker mediante mensajería.
  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(data.capture.stage, 'Solicitando acceso al audio de la pestaña');
  assert.equal(data.capture.starting, true);

  await sendWorker({target: 'background', type: 'SESSION_START',
    session: {id: 's1', title: 'Prueba local', createdAt: '2026-10-26T00:00:00Z'}});
  await sendWorker({target: 'background', type: 'SESSION_SEGMENT',
    session: {id: 's1', title: 'Prueba local'},
    segment: {start: 0, end: 2, text: 'Texto reconocido'}});
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].segments.length, 1);
  assert.equal(data.sessions[0].segments[0].text, 'Texto reconocido');
  console.log('OK: almacenamiento por mensajes, inicio y transcripción persistida');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
