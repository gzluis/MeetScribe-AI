const tokenInput = document.getElementById('token');
const serverBadge = document.getElementById('serverBadge');
const stateBadge = document.getElementById('stateBadge');
const sessionName = document.getElementById('sessionName');
const helpText = document.getElementById('helpText');
const errorText = document.getElementById('errorText');
const copyStatus = document.getElementById('copyStatus');
const transcript = document.getElementById('transcript');
const sessionSelect = document.getElementById('sessionSelect');
const count = document.getElementById('count');
const followLive = document.getElementById('followLive');
const {formatTime, latestSegments, plainTranscript} = MeetScribeText;
let savedSessions = [];
let selectedSessionId = '';
let renderedSessionId = null;
let renderedSegmentCount = 0;
let renderedLastText = '';
let fontSize = 14;

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

function makeSegment(segment) {
  const block = document.createElement('div');
  block.className = 'segment';
  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = `${formatTime(segment.start)} — ${formatTime(segment.end)}`;
  const content = document.createElement('p');
  content.textContent = segment.text; // Siempre textContent: el texto reconocido no se interpreta como HTML.
  block.append(time, content);
  return block;
}

function drawTranscript() {
  const segments = currentSession()?.segments || [];
  count.textContent = `${segments.length} fragmentos`;
  // No destruir los nodos existentes al llegar texto: así se conserva la selección del usuario.
  const reset = renderedSessionId !== selectedSessionId ||
    segments.length < renderedSegmentCount ||
    (renderedSegmentCount > 0 && segments[renderedSegmentCount - 1]?.text !== renderedLastText);
  const selectedText = window.getSelection()?.toString() || '';
  const atBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 65;
  if (reset) {
    transcript.replaceChildren();
    renderedSessionId = selectedSessionId;
    renderedSegmentCount = 0;
    renderedLastText = '';
  }
  if (!segments.length) {
    if (!transcript.querySelector('.empty')) {
      transcript.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Todavía no hay texto. El audio se procesa en fragmentos de unos 10 segundos; según el equipo puede existir un retraso mayor.';
      transcript.append(empty);
    }
    return;
  }
  transcript.querySelector('.empty')?.remove();
  if (segments.length > renderedSegmentCount) {
    const fragment = document.createDocumentFragment();
    for (let i = renderedSegmentCount; i < segments.length; i++) fragment.append(makeSegment(segments[i]));
    transcript.append(fragment);
    renderedSegmentCount = segments.length;
    renderedLastText = segments[segments.length - 1].text;
    if ((reset || atBottom) && followLive.checked && !selectedText) transcript.scrollTop = transcript.scrollHeight;
  }
}

function describeAudio(capture, segmentCount) {
  if (capture.starting) return capture.stage || 'Preparando captura de audio...';
  if (!capture.active) return capture.processing
    ? 'Terminando de procesar el último audio.'
    : 'Diagnóstico de audio disponible al iniciar una captura.';
  const d = capture.audioProbe;
  if (!d || !d.updatedAt) return 'Comprobando si la pestaña entrega audio...';
  if (Date.now() - d.updatedAt > 7000)
    return 'No llegan nuevas mediciones de audio. Compruebe que la pestaña siga reproduciendo sonido.';
  if (!d.channels)
    return 'No se ha detectado ningún canal de audio. Compruebe la pestaña seleccionada.';
  const seconds = Number(d.sentSeconds || 0);
  if (seconds < 2)
    return 'Audio conectado. Comprobando el nivel real de sonido...';
  const signal = Number(d.maxPeak || 0);
  if (signal < 0.003)
    return 'Se envían ' + seconds.toFixed(1) + ' s, pero el sonido está prácticamente en silencio. Compruebe el audio de la pestaña.';
  if (capture.processing)
    return 'Audio detectado: ' + seconds.toFixed(1) + ' s enviados. Whisper está procesando un bloque.';
  if (segmentCount === 0 && seconds >= 20)
    return 'Audio detectado y ' + seconds.toFixed(1) + ' s enviados, pero 0 fragmentos reconocidos. Detenga y reinicie la captura; si continúa, revise el motor local.';
  return 'Audio real detectado · ' + seconds.toFixed(1) + ' s enviados al motor local.';
}

function drawSessions(activeId, isActive) {
  const visible = savedSessions.map(s => s.id);
  const next = isActive && visible.includes(activeId) ? activeId :
    (visible.includes(selectedSessionId) ? selectedSessionId : (visible.includes(activeId) ? activeId : visible[0] || ''));
  selectedSessionId = next;
  // No reconstruir el selector en cada fragmento: evita perder interacciones en curso.
  const values = [...sessionSelect.options].map(o => o.value);
  const labels = savedSessions.map(s => `${s.title} · ${new Date(s.createdAt).toLocaleDateString('es-SV')}`);
  if (values.join('|') !== visible.join('|') ||
      savedSessions.some((s, i) => sessionSelect.options[i]?.textContent !== labels[i])) {
    sessionSelect.replaceChildren();
    for (let i = 0; i < savedSessions.length; i++) {
      const option = document.createElement('option');
      option.value = savedSessions[i].id;
      option.textContent = labels[i];
      sessionSelect.append(option);
    }
    if (!savedSessions.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Sin sesiones';
      sessionSelect.append(option);
    }
  }
  sessionSelect.value = selectedSessionId;
  drawTranscript();
}

async function render() {
  const storage = await chrome.storage.local.get(['capture', 'sessions', 'activeSessionId']);
  const capture = storage.capture || {};
  savedSessions = storage.sessions || [];
  const live = Boolean(capture.active);
  const starting = Boolean(capture.starting);
  document.getElementById('stop').disabled = !live;
  document.querySelector('.meter').classList.toggle('active', live && Number(capture.audioProbe?.peak || 0) > 0.003);
  document.getElementById('audioDiagnostic').textContent = describeAudio(
    capture, (savedSessions.find(s => s.id === storage.activeSessionId)?.segments || []).length);
  stateBadge.textContent = starting ? 'Preparando' :
    (live ? (capture.processing ? 'Procesando' : 'Capturando') : (capture.processing ? 'Finalizando' : 'Inactivo'));
  stateBadge.className = `pill ${live ? '' : 'off'}`;
  sessionName.textContent = capture.title || 'Sin reunión activa';
  helpText.textContent = live
    ? 'La transcripción continúa aunque copies o selecciones texto. Los nuevos fragmentos aparecen aquí.'
    : (starting ? 'Inicializando el capturador: espere la confirmación antes de hacer otro click.'
      : (capture.processing ? 'Procesando los últimos fragmentos de la sesión.'
        : 'Abra Meet y haga click en el icono de la extensión para comenzar.'));
  errorText.textContent = capture.error || '';
  drawSessions(storage.activeSessionId, live);
}

async function checkServer() {
  serverBadge.textContent = 'Comprobando';
  try {
    const response = await fetch('http://127.0.0.1:8765/health', {cache: 'no-store'});
    const info = await response.json();
    if (!info.ready) throw new Error('Modelo sin cargar');
    serverBadge.textContent = info.model?.includes('\\') || info.model?.includes('/') ?
      'Whisper listo · local' : `Listo · ${info.model}`;
    serverBadge.className = 'pill';
  } catch (_) {
    serverBadge.textContent = 'Desconectado';
    serverBadge.className = 'pill bad';
  }
}

async function copyText(text, what) {
  if (!text.trim()) { copyStatus.textContent = 'No hay texto disponible para copiar.'; return; }
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = `${what} copiado al portapapeles. Puedes pegarlo en una IA con Ctrl+V.`;
  } catch (_) {
    copyStatus.textContent = 'No se pudo escribir en el portapapeles. Seleccione el texto y use Ctrl+C.';
  }
}

document.getElementById('copyAll').addEventListener('click', () => {
  copyText(plainTranscript(currentSession()?.segments), 'Texto completo');
});
document.getElementById('copyRecent').addEventListener('click', () => {
  copyText(plainTranscript(latestSegments(currentSession()?.segments)), 'Texto reciente');
});
document.getElementById('copySelection').addEventListener('click', () => {
  const selection = window.getSelection();
  const text = selection?.toString() || '';
  if (!selection || ![...Array(selection.rangeCount).keys()].some(i => transcript.contains(selection.getRangeAt(i).commonAncestorContainer))) {
    copyStatus.textContent = 'Seleccione primero un fragmento dentro de la transcripción.';
    return;
  }
  copyText(text, 'Selección');
});

document.getElementById('fontDown').addEventListener('click', () => changeFont(-1));
document.getElementById('fontUp').addEventListener('click', () => changeFont(1));
function changeFont(amount) {
  fontSize = Math.max(12, Math.min(21, fontSize + amount));
  transcript.style.setProperty('--transcript-font-size', `${fontSize}px`);
}
document.getElementById('goBottom').addEventListener('click', () => {
  followLive.checked = true;
  transcript.scrollTop = transcript.scrollHeight;
  transcript.focus({preventScroll: true});
});

document.getElementById('saveToken').addEventListener('click', async () => {
  const value = tokenInput.value.trim();
  if (!value) { errorText.textContent = 'Pegue una clave válida.'; return; }
  await chrome.storage.local.set({pairingToken: value});
  errorText.textContent = 'Clave guardada. Vuelva a Meet y haga click en el icono para iniciar.';
});
document.getElementById('checkServer').addEventListener('click', checkServer);
document.getElementById('stop').addEventListener('click', async () => {
  document.getElementById('stop').disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({type: 'STOP_REQUEST'});
    if (result?.ok === false) throw new Error(result.error || 'No se pudo detener');
  } catch (error) { errorText.textContent = String(error); }
});
sessionSelect.addEventListener('change', () => { selectedSessionId = sessionSelect.value; drawTranscript(); });
document.getElementById('exportTxt').addEventListener('click', () => {
  const s = currentSession();
  if (!s?.segments?.length) { errorText.textContent = 'No hay contenido para exportar.'; return; }
  const lines = [s.title, `Fecha: ${new Date(s.createdAt).toLocaleString('es-SV')}`, '', plainTranscript(s.segments, true)];
  download(lines.join('\n'), `${safeFilename(s.title)}.txt`, 'text/plain;charset=utf-8');
});
document.getElementById('exportSrt').addEventListener('click', () => {
  const s = currentSession();
  if (!s?.segments?.length) { errorText.textContent = 'No hay contenido para exportar.'; return; }
  const timestamp = sec => `${formatTime(sec)},${String(Math.round(((Number(sec) || 0) % 1) * 1000)).padStart(3, '0')}`;
  const lines = s.segments.map((x, i) => `${i + 1}\n${timestamp(x.start)} --> ${timestamp(x.end)}\n${x.text}\n`);
  download(lines.join('\n'), `${safeFilename(s.title)}.srt`, 'text/plain;charset=utf-8');
});

// Serializar renders previene carreras cuando la captura actualiza el almacenamiento rápidamente.
let rendering = Promise.resolve();
chrome.storage.onChanged.addListener((_changes, namespace) => {
  if (namespace === 'local') rendering = rendering.then(render).catch(console.error);
});
(async () => {
  const versionLabel = document.getElementById('extensionVersion');
  if (versionLabel) versionLabel.textContent = 'V ' + chrome.runtime.getManifest().version;
  const saved = await chrome.storage.local.get('pairingToken');
  tokenInput.value = saved.pairingToken || '';
  if (!saved.pairingToken) document.getElementById('setup').open = true;
  await render();
  await checkServer();
})();
