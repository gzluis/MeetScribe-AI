const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'transcript-utils.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const {formatTime, plainTranscript, latestSegments} = ctx.MeetScribeText;
const segments = [
  {start: 0, end: 20, text: ' Buenos días '},
  {start: 40, end: 41, text: ' Tema uno '},
  {start: 200, end: 205, text: ' Pregunta importante '}
];
assert.equal(formatTime(3661), '01:01:01');
assert.equal(plainTranscript(segments), 'Buenos días\nTema uno\nPregunta importante');
assert.equal(plainTranscript([segments[0]], true), '[00:00:00] Buenos días');
assert.equal(plainTranscript(null), '');
assert.equal(plainTranscript([{text:'  '},...segments]).startsWith('Buenos'), true);
assert.equal(latestSegments(segments, 120).length, 1);
assert.equal(latestSegments(segments, 220).length, 3);
assert.equal(latestSegments([]).length, 0);
console.log('Transcripción y copia: 8 verificaciones correctas');
