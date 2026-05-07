// AudioWorklet processor: accumulates mic input into 100ms PCM chunks
// and posts them as Int16 ArrayBuffers to the main thread (zero-copy).
// Expected AudioContext sample rate: 16000 Hz (Gemini Live input format).

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Int16Array(1600) // 100ms at 16kHz
    this._offset = 0
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true

    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      this._buffer[this._offset++] = s < 0 ? s * 32768 : s * 32767

      if (this._offset >= 1600) {
        // Transfer ownership — zero-copy, no GC pressure
        this.port.postMessage(this._buffer.buffer, [this._buffer.buffer])
        this._buffer = new Int16Array(1600)
        this._offset = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor)
