let mediaStream = null;
let context = null;
let audioNode = null;
let websocket = null;
let session = null;
let authenticated = false;
let finishing = false;
let saving = Promise.resolve();
let stopTimer = null;
let sentAudioBytes = 0;
let maxAudioPeak = 0;
let lastProbeReport = 0;

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
  await saveCapture({active: false, starting: false, processing: false, error, stage: error ? 'Error al iniciar o procesar audio' : 'Captura finalizada'});
  session = null;
  authenticated = false;
  finishing = false;
}

async function startCapture(message) {
  if (mediaStream || websocket) return {ok: false, error: 'Ya existe una captura activa.'};
  finishing = false;
  await saveCapture({starting: true, active: false, processing: false, error: '', stage: 'Solicitando acceso al audio de la pestaña'});
  sentAudioBytes = 0;
  maxAudioPeak = 0;
  lastProbeReport = 0;
  session = {id: message.sessionId, title: message.title, createdAt: new Date().toISOString()};
  try {
    mediaStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId}},
        video: false
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Caducó la autorización de captura. Vuelva a pulsar el icono.')), 15000))
    ]);
    await saveCapture({stage: 'Audio de la pestaña autorizado. Preparando procesador de sonido'});
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error('La pestaña no proporcionó ninguna pista de audio.');
    audioTrack.addEventListener('ended', () => {
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

    await saveCapture({stage: 'Conectando con Whisper Local'});
    websocket = new WebSocket('ws://127.0.0.1:8765/ws');
    authenticated = false;
    websocket.onopen = () => websocket.send(JSON.stringify({type: 'auth', token: message.token}));
    websocket.onmessage = async event => {
      let packet;
      try { packet = JSON.parse(event.data); } catch (_) { return; }
      if (packet.type === 'ready') {
        authenticated = true;
        await saveCapture({starting: false, active: !finishing, processing: false, error: '', stage: 'Captura de audio y motor conectados'});
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
      const data = event.data;
      if (data?.type === 'level') {
        maxAudioPeak = Math.max(maxAudioPeak, Number(data.peak) || 0);
        const now = Date.now();
        if (now - lastProbeReport >= 950) {
          lastProbeReport = now;
          void saveCapture({audioProbe: {
            sentSeconds: Math.round(sentAudioBytes / 32000 * 10) / 10,
            rms: Number(data.rms) || 0,
            peak: Number(data.peak) || 0,
            maxPeak: maxAudioPeak,
            channels: data.channels || 0,
            updatedAt: now
          }}).catch(console.error);
        }
        return;
      }
      if (!(data instanceof ArrayBuffer)) return;
      if (authenticated && websocket?.readyState === WebSocket.OPEN && !finishing) {
        if (websocket.bufferedAmount < 5_000_000) {
          websocket.send(data);
          sentAudioBytes += data.byteLength;
        } else {
          void saveCapture({error: 'El motor va más lento que el audio: se han perdido fragmentos.'});
        }
      }
    };
    // No retener indefinidamente el canal de respuesta por una promesa resume() pendiente.
    // En algunos navegadores el AudioContext puede quedar suspendido por la política multimedia.
    const resume = context.resume();
    await Promise.race([
      resume,
      new Promise((_, reject) => setTimeout(() =>
        reject(new Error('El procesador de audio no pudo activarse. Reinicie la captura sobre una pestaña con sonido.')), 7000))
    ]);
    if (context.state !== 'running') throw new Error('El procesador de audio está suspendido; compruebe los permisos multimedia de Edge.');
    const storage = await chrome.storage.local.get('sessions');
    const current = storage.sessions || [];
    if (!current.some(s => s.id === session.id)) {
      await chrome.storage.local.set({sessions: [{...session, segments: []}, ...current].slice(0, 30)});
    }
    await saveCapture({audioProbe: {sentSeconds: 0, rms: 0, peak: 0, maxPeak: 0, channels: 0, updatedAt: Date.now()}});
    return {ok: true};
  } catch (error) {
    await finalize(error.message || String(error));
    return {ok: false, error: error.message || String(error)};
  }
}

// Confirmar el mensaje ANTES de esperar permisos/audio/red.
// Los resultados y errores se comunican mediante chrome.storage.local,
// de modo que un AudioContext suspendido no cierre un canal asíncrono.
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target !== 'offscreen') return false;
  if (message.type === 'START') {
    respond({ok: true, accepted: true});
    void startCapture(message).catch(async error => {
      console.error('MeetScribe: falló startCapture', error);
      await saveCapture({active: false, starting: false,
        error: 'Fallo inesperado en captura: ' + (error?.message || String(error))});
    });
    return false;
  }
  if (message.type === 'STOP') {
    respond({ok: true, accepted: true});
    void stopCapture().catch(async error => {
      console.error('MeetScribe: falló stopCapture', error);
      await saveCapture({active: false, starting: false,
        error: 'Error al detener captura: ' + (error?.message || String(error))});
    });
    return false;
  }
  return false;
});
