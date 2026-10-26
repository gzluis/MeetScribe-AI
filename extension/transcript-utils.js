// Funciones puras reutilizables en el panel y en pruebas automatizadas.
(() => {
  'use strict';
  function formatTime(seconds) {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n % 3600 / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  function cleanSegments(segments) {
    if (!Array.isArray(segments)) return [];
    return segments.filter(item => item && typeof item.text === 'string' && item.text.trim());
  }
  function latestSegments(segments, seconds = 120) {
    const valid = cleanSegments(segments);
    if (!valid.length) return [];
    const end = Math.max(0, Number(valid[valid.length - 1].end) || 0);
    return valid.filter(item => (Number(item.end) || 0) >= end - seconds);
  }
  function plainTranscript(segments, withTimestamps = false) {
    return cleanSegments(segments).map(item => {
      const line = item.text.trim();
      return withTimestamps ? `[${formatTime(item.start)}] ${line}` : line;
    }).join('\n');
  }
  globalThis.MeetScribeText = Object.freeze({formatTime, cleanSegments, latestSegments, plainTranscript});
})();
