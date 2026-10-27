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
  const showPanel = () => { void chrome.sidePanel.open({tabId: tab.id}).catch(console.error); };
  try {
    const saved = await chrome.storage.local.get(['pairingToken', 'capture']);
    if (saved.capture?.active || saved.capture?.starting) { showPanel(); return; }
    if (!saved.pairingToken) {
      showPanel();
      await updateStatus({active: false, starting: false, error: 'Pegue primero la clave del servidor local.'});
      return;
    }
    await ensureOffscreen();
    // Solicitar la autorización ANTES de abrir el panel y de hacer consultas al servidor;
    // así preservamos el gesto del usuario exigido por tabCapture.
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tab.id});
    showPanel();
    const response = await fetch('http://127.0.0.1:8765/health', {cache: 'no-store'});
    if (!response.ok || !(await response.json()).ready) throw new Error('El motor local aún no está listo.');
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
