/* Solo PCM mono a 16 kHz; ninguna dependencia ni red en el AudioWorklet. */
class PCM16Sender extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.next = 0;
    this.frame = new Int16Array(2048);
    this.index = 0;
    this.energy = 0;
    this.peak = 0;
    this.levelSamples = 0;
  }
  process(inputs) {
    const channels = inputs[0] || [];
    const data = channels[0];
    if (!data) return true;
    let position = this.next;
    while (position < data.length) {
      const i = Math.floor(position);
      const f = position - i;
      // Combinar canales para no perder voz cuando llega solo por el derecho.
      let sample = 0;
      for (const channel of channels) {
        sample += (channel[i] || 0) * (1 - f) +
          (channel[Math.min(i + 1, channel.length - 1)] || 0) * f;
      }
      sample = Math.max(-1, Math.min(1, sample / channels.length));
      this.energy += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
      this.levelSamples++;
      if (this.levelSamples >= 16000) {
        this.port.postMessage({type: 'level', rms: Math.sqrt(this.energy / this.levelSamples),
          peak: this.peak, channels: channels.length});
        this.energy = 0;
        this.peak = 0;
        this.levelSamples = 0;
      }
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
