let mediaStream = null;
let context = null;
let audioNode = null;
let websocket = null;
let session = null;
let authenticated = false;
let finishing = false;
let saving = Promise.resolve();
let stopTimer = null;

async function saveCapture(partial) {
  const {capture = {}} = await chrome.storage.local.get('capture');
  await chrome.storage.local.set({capture: {...capture, ...partial}});
}

function appendSegment(segment) {
  saving = saving.then(async () => {
    const {sessions = []} = await chrome.storage.local.get('sessions');
    let item = sessions.find(s => s.id === session?.id);
    if (!item && session) {
      item = {...session, segments: []};
      sessions.unshift(item);
    }
    if (!item) return;
    item.segments.push(segment);
    // 30 últimas reuniones; nunca se suben transcripciones a un servicio externo.
    await chrome.storage.local.set({sessions: sessions.slice(0, 30)});
  }).catch(error => console.error('No se pudo guardar el segmento:', error));
}

async function stopAudio() {
  try { audioNode?.disconnect(); } catch (_) {}
  audioNode = null;
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  mediaStream = null;
  if (context) await context.close().catch(() => {});
  context = null;
}

async function stopCapture() {
  if (finishing) return;
  finishing = true;
  await stopAudio();
  await saveCapture({active: false, processing: true});
  if (websocket?.readyState === WebSocket.OPEN && authenticated) {
    websocket.send(JSON.stringify({type: 'stop'}));
    // Permitir que Whisper procese el último fragmento, sin cerrar prematuramente.
    stopTimer = setTimeout(() => finalize('Tiempo de espera agotado al finalizar la transcripción.'), 90000);
  } else {
    finalize();
  }
}

async function finalize(error = '') {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  await saving;
  const old = websocket;
  websocket = null;
  if (old?.readyState === WebSocket.OPEN) old.close();
  await stopAudio();
  await saveCapture({active: false, processing: false, error});
  session = null;
  authenticated = false;
  finishing = false;
}

async function startCapture(message) {
  if (mediaStream || websocket) return {ok: false, error: 'Ya existe una captura activa.'};
  finishing = false;
  session = {id: message.sessionId, title: message.title, createdAt: new Date().toISOString()};
  try {
    mediaStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId}},
        video: false
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Caducó la autorización de captura. Vuelva a pulsar el icono.')), 15000))
    ]);
    mediaStream.getAudioTracks()[0].addEventListener('ended', () => {
      if (!finishing) stopCapture();
    });
    context = new AudioContext({latencyHint: 'interactive'});
    await context.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));
    const source = context.createMediaStreamSource(mediaStream);
    // Al capturar una pestaña Chrome deja de reproducirla; restituimos el sonido.
    source.connect(context.destination);
    audioNode = new AudioWorkletNode(context, 'pcm16-sender');
    source.connect(audioNode);
    const silent = context.createGain();
    silent.gain.value = 0;
    audioNode.connect(silent).connect(context.destination);

    websocket = new WebSocket('ws://127.0.0.1:8765/ws');
    authenticated = false;
    websocket.onopen = () => websocket.send(JSON.stringify({type: 'auth', token: message.token}));
    websocket.onmessage = async event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch (_) { return; }
      if (packet.type === 'ready') {
        authenticated = true;
        await saveCapture({active: !finishing, processing: false, error: ''});
      } else if (packet.type === 'processing') {
        await saveCapture({processing: true});
      } else if (packet.type === 'segment') {
        appendSegment({start: packet.start, end: packet.end, text: packet.text});
      } else if (packet.type === 'finished') {
        await finalize();
      } else if (packet.type === 'error') {
        await finalize(packet.message || 'Error del motor local');
      }
    };
    websocket.onerror = () => {
      if (!finishing) finalize('Se perdió la conexión con el servicio local.');
    };
    websocket.onclose = () => {
      if (!finishing && session) finalize('Se cerró la conexión con el transcriptor.');
    };
    audioNode.port.onmessage = event => {
      if (authenticated && websocket?.readyState === WebSocket.OPEN && !finishing) {
        if (websocket.bufferedAmount < 5_000_000) {
          websocket.send(event.data);
        } else {
          saveCapture({error: 'El motor va más lento que el audio: se han perdido fragmentos.'});
        }
      }
    };
    await context.resume();
    return {ok: true};
  } catch (error) {
    await finalize(error.message || String(error));
    return {ok: false, error: error.message || String(error)};
  }
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target !== 'offscreen') return;
  if (message.type === 'START') {
    startCapture(message).then(respond);
    return true;
  }
  if (message.type === 'STOP') {
    stopCapture().then(() => respond({ok: true})).catch(err => respond({ok: false, error: String(err)}));
    return true;
  }
});
