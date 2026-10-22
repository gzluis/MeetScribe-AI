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

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  // La acción sobre el icono es el gesto del usuario requerido por tabCapture.
  try { await chrome.sidePanel.open({tabId: tab.id}); } catch (_) { /* Side panel opcional */ }
  const saved = await chrome.storage.local.get(['pairingToken', 'capture']);
  if (saved.capture?.active) return; // El panel ya permite detener.
  if (!saved.pairingToken) {
    await updateStatus({active: false, error: 'Pegue primero la clave del servidor local.'});
    return;
  }
  try {
    const response = await fetch('http://127.0.0.1:8765/health', {cache: 'no-store'});
    if (!response.ok || !(await response.json()).ready) throw new Error('El motor local aún no está listo.');
    await ensureOffscreen();
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tab.id});
    const sessionId = crypto.randomUUID();
    const title = (tab.title || 'Reunión').slice(0, 120);
    await chrome.storage.local.set({
      activeSessionId: sessionId,
      capture: {active: true, sessionId, title, startedAt: new Date().toISOString(), error: ''}
    });
    const result = await chrome.runtime.sendMessage({
      target: 'offscreen', type: 'START', streamId, sessionId, title, token: saved.pairingToken
    });
    if (!result?.ok) throw new Error(result?.error || 'No se pudo iniciar la captura');
  } catch (error) {
    await updateStatus({active: false, error: error.message || String(error)});
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
