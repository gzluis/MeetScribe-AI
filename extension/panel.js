const tokenInput = document.getElementById('token');
const serverBadge = document.getElementById('serverBadge');
const stateBadge = document.getElementById('stateBadge');
const sessionName = document.getElementById('sessionName');
const helpText = document.getElementById('helpText');
const errorText = document.getElementById('errorText');
const transcript = document.getElementById('transcript');
const sessionSelect = document.getElementById('sessionSelect');
const count = document.getElementById('count');
let savedSessions = [];
let selectedSessionId = '';

const formatTime = seconds => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(n / 3600)).padStart(2,'0')}:${String(Math.floor(n % 3600 / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`;
};

function safeFilename(name) {
  return (name || 'reunion').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim().slice(0, 65) || 'reunion';
}
function download(text, filename, mime) {
  const file = new Blob(['\uFEFF', text], {type: mime});
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function currentSession() { return savedSessions.find(s => s.id === selectedSessionId); }

function drawTranscript() {
  const session = currentSession();
  transcript.replaceChildren();
  const segments = session?.segments || [];
  count.textContent = `${segments.length} segmentos`;
  if (!segments.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Todavía no hay texto. Los fragmentos de audio se procesan aproximadamente cada 10 segundos, según la velocidad del equipo.';
    transcript.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const segment of segments) {
    const block = document.createElement('div');
    block.className = 'segment';
    const time = document.createElement('div');
    time.className = 'timestamp';
    time.textContent = `${formatTime(segment.start)} — ${formatTime(segment.end)}`;
    const content = document.createElement('p');
    content.textContent = segment.text;
    block.append(time, content);
    fragment.append(block);
  }
  transcript.append(fragment);
  transcript.scrollTop = transcript.scrollHeight;
}

function drawSessions(activeId, isActive) {
  const previous = selectedSessionId;
  const visible = savedSessions.map(s => s.id);
  selectedSessionId = isActive && visible.includes(activeId) ? activeId : (visible.includes(previous) ? previous : (visible.includes(activeId) ? activeId : visible[0] || ''));
  sessionSelect.replaceChildren();
  for (const item of savedSessions) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.title} · ${new Date(item.createdAt).toLocaleDateString('es-SV')}`;
    sessionSelect.append(option);
  }
  if (!savedSessions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sin reuniones guardadas';
    sessionSelect.append(option);
  }
  sessionSelect.value = selectedSessionId;
  drawTranscript();
}

async function render() {
  const storage = await chrome.storage.local.get(['capture', 'sessions', 'activeSessionId']);
  const capture = storage.capture || {};
  savedSessions = storage.sessions || [];
  const live = Boolean(capture.active);
  document.getElementById('stop').disabled = !live;
  document.querySelector('.meter').classList.toggle('active', live);
  stateBadge.textContent = live ? (capture.processing ? 'Procesando' : 'Capturando') : (capture.processing ? 'Finalizando' : 'Inactivo');
  stateBadge.className = `pill ${live ? '' : 'off'}`;
  sessionName.textContent = capture.title || 'Sin reunión activa';
  helpText.textContent = live
    ? 'Audio de la pestaña en captura. Detenga la sesión al terminar; se procesará el último fragmento.'
    : (capture.processing ? 'Guardando los últimos fragmentos, puede tardar según su equipo.' : 'Para iniciar, abra Google Meet y haga clic en el icono de MeetScribe en la barra del navegador.');
  errorText.textContent = capture.error || '';
  drawSessions(storage.activeSessionId, live);
}

async function checkServer() {
  serverBadge.textContent = 'Comprobando';
  try {
    const response = await fetch('http://127.0.0.1:8765/health', {cache: 'no-store'});
    const info = await response.json();
    if (!info.ready) throw new Error('Modelo sin cargar');
    serverBadge.textContent = `Listo · ${info.model}`;
    serverBadge.className = 'pill';
  } catch (_) {
    serverBadge.textContent = 'Desconectado';
    serverBadge.className = 'pill bad';
  }
}

document.getElementById('saveToken').addEventListener('click', async () => {
  const value = tokenInput.value.trim();
  if (!value) { errorText.textContent = 'Pegue una clave válida.'; return; }
  await chrome.storage.local.set({pairingToken: value});
  errorText.textContent = 'Clave guardada. Ahora haga clic en el icono de la extensión, con Meet abierto.';
});
document.getElementById('checkServer').addEventListener('click', checkServer);
document.getElementById('stop').addEventListener('click', async () => {
  document.getElementById('stop').disabled = true;
  try { await chrome.runtime.sendMessage({type: 'STOP_REQUEST'}); }
  catch (error) { errorText.textContent = String(error); }
});
sessionSelect.addEventListener('change', () => { selectedSessionId = sessionSelect.value; drawTranscript(); });
document.getElementById('exportTxt').addEventListener('click', () => {
  const s = currentSession();
  if (!s?.segments?.length) { errorText.textContent = 'No hay contenido para exportar.'; return; }
  const lines = [s.title, `Fecha: ${new Date(s.createdAt).toLocaleString('es-SV')}`, '', ...s.segments.map(x => `[${formatTime(x.start)}] ${x.text}`)];
  download(lines.join('\n'), `${safeFilename(s.title)}.txt`, 'text/plain;charset=utf-8');
});
document.getElementById('exportSrt').addEventListener('click', () => {
  const s = currentSession();
  if (!s?.segments?.length) { errorText.textContent = 'No hay contenido para exportar.'; return; }
  const timestamp = sec => `${formatTime(sec)},${String(Math.round((sec % 1) * 1000)).padStart(3,'0')}`;
  const lines = s.segments.map((x, i) => `${i+1}\n${timestamp(x.start)} --> ${timestamp(x.end)}\n${x.text}\n`);
  download(lines.join('\n'), `${safeFilename(s.title)}.srt`, 'text/plain;charset=utf-8');
});

chrome.storage.onChanged.addListener((_changes, namespace) => { if (namespace === 'local') render(); });
(async () => {
  const saved = await chrome.storage.local.get('pairingToken');
  tokenInput.value = saved.pairingToken || '';
  await render();
  await checkServer();
})();
