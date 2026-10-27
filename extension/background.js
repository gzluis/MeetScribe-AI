const OFFSCREEN_PATH = 'offscreen.html';
let preparingOffscreen = null;

async function ensureOffscreen() {
  if (preparingOffscreen) return preparingOffscreen;
  preparingOffscreen = (async () => {
    const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['USER_MEDIA'],
        justification: 'Captura explícita y autorizada de audio de la pestaña para transcripción local.'
      });
    }
  })();
  try { await preparingOffscreen; } finally { preparingOffscreen = null; }
}

async function updateStatus(values) {
  await chrome.storage.local.set({capture: values});
}

// Comprobar que el documento offscreen ha cargado su listener antes de
// generar el streamId, ya que Chrome lo invalida después de pocos segundos.
async function waitForOffscreen() {
  for (let i = 0; i < 6; i++) {
    try {
      const result = await Promise.race([
        chrome.runtime.sendMessage({target: 'offscreen', type: 'PING'}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PING agotado')), 1200))
      ]);
      if (result?.ok && result.source === 'offscreen') return;
    } catch (_) { /* El documento puede estar cargando */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('El capturador de audio no respondió. Recargue la extensión e inténtelo nuevamente.');
}

// Único punto autorizado para guardar datos: los documentos offscreen de
// Manifest V3 solo pueden utilizar chrome.runtime.
let storageQueue = Promise.resolve();
function queueStorage(operation) {
  const task = storageQueue.then(operation);
  storageQueue = task.catch(error => console.error('Error guardando datos de MeetScribe', error));
  return task;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'background') return false;
  const allowed = ['CAPTURE_PATCH', 'SESSION_START', 'SESSION_SEGMENT'];
  if (!allowed.includes(message.type)) return false;
  void queueStorage(async () => {
    if (message.type === 'CAPTURE_PATCH') {
      const previous = (await chrome.storage.local.get('capture')).capture || {};
      await chrome.storage.local.set({capture: {...previous, ...(message.partial || {})}});
    } else if (message.type === 'SESSION_START') {
      const incoming = message.session;
      if (!incoming?.id) throw new Error('La sesión no tiene identificador');
      const {sessions = []} = await chrome.storage.local.get('sessions');
      if (!sessions.some(s => s.id === incoming.id)) {
        await chrome.storage.local.set({sessions: [{...incoming, segments: []}, ...sessions].slice(0, 30)});
      }
    } else if (message.type === 'SESSION_SEGMENT') {
      const incoming = message.session;
      if (!incoming?.id || typeof message.segment?.text !== 'string') throw new Error('Segmento inválido');
      const {sessions = []} = await chrome.storage.local.get('sessions');
      let item = sessions.find(s => s.id === incoming.id);
      if (!item) {
        item = {...incoming, segments: []};
        sessions.unshift(item);
      }
      item.segments ||= [];
      item.segments.push(message.segment);
      await chrome.storage.local.set({sessions: sessions.slice(0, 30)});
    }
    return {ok: true};
  }).then(sendResponse, error => sendResponse({ok: false, error: String(error)}));
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const showPanel = () => { void chrome.sidePanel.open({tabId: tab.id}).catch(console.error); };
  try {
    const saved = await chrome.storage.local.get(['pairingToken', 'capture']);
    // Permite recuperarse de un inicio bloqueado tras actualizar la extensión.
    const age = Date.now() - (Date.parse(saved.capture?.startedAt || '') || 0);
    const stale = saved.capture?.starting && age > 20000;
    if (saved.capture?.active || (saved.capture?.starting && !stale)) { showPanel(); return; }
    if (stale) {
      await updateStatus({...saved.capture, active: false, starting: false,
        error: '', stage: 'Reiniciando captura tras inicio interrumpido'});
    }
    if (!saved.pairingToken) {
      showPanel();
      await updateStatus({active: false, starting: false, error: 'Pegue primero la clave del servidor local.'});
      return;
    }
    await ensureOffscreen();
    await waitForOffscreen();
    // Verificar Whisper antes de crear streamId: el ID caduca rápidamente.
    const response = await fetch('http://127.0.0.1:8765/health', {cache: 'no-store'});
    if (!response.ok || !(await response.json()).ready) throw new Error('El motor local aún no está listo.');
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tab.id});
    showPanel();
    const sessionId = crypto.randomUUID();
    const title = (tab.title || 'Reunión').slice(0, 120);
    await chrome.storage.local.set({
      activeSessionId: sessionId,
      capture: {active: false, starting: true, sessionId, title, startedAt: new Date().toISOString(),
        error: '', stage: 'Iniciando captura de audio', processing: false}
    });
    // El documento offscreen confirma recepción inmediatamente; informará estado real por storage.
    const result = await chrome.runtime.sendMessage({
      target: 'offscreen', type: 'START', streamId, sessionId, title, token: saved.pairingToken
    });
    if (!result?.ok) throw new Error(result?.error || 'El capturador no recibió el mensaje de inicio.');
  } catch (error) {
    showPanel();
    await updateStatus({active: false, starting: false, error: error.message || String(error),
      stage: 'No se pudo iniciar la captura'});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STOP_REQUEST') {
    (async () => {
      try {
        const result = await chrome.runtime.sendMessage({target: 'offscreen', type: 'STOP'});
        sendResponse(result || {ok: true});
      } catch (error) { sendResponse({ok: false, error: String(error)}); }
    })();
    return true;
  }
});
