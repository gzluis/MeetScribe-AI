/* Solo PCM mono a 16 kHz; ninguna dependencia ni red en el AudioWorklet. */
class PCM16Sender extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.next = 0;
    this.frame = new Int16Array(2048);
    this.index = 0;
  }
  process(inputs) {
    const data = inputs[0]?.[0];
    if (!data) return true;
    let position = this.next;
    while (position < data.length) {
      const i = Math.floor(position);
      const f = position - i;
      const value = (data[i] || 0) * (1 - f) + (data[Math.min(i + 1, data.length - 1)] || 0) * f;
      const sample = Math.max(-1, Math.min(1, value));
      this.frame[this.index++] = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.index === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(2048);
        this.index = 0;
      }
      position += this.step;
    }
    this.next = position - data.length;
    return true;
  }
}
registerProcessor('pcm16-sender', PCM16Sender);
