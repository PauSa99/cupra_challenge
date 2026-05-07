// useSallyLive — React hook managing the Gemini Live API audio pipeline.
//
// Audio capture:  getUserMedia → AudioContext(16kHz) → AudioWorklet → PCM Int16 → /ws/sally binary
// Audio playback: /ws/sally binary → PCM Int16 → gapless AudioBufferSourceNode queue (24kHz)
// VAD:            @ricky0123/vad-web on the same mic stream → barge-in interrupt
// State machine:  idle → connecting → listening → processing → speaking → idle

import { useRef, useCallback, useEffect } from 'react'
import { useSallyStore } from '../store/useSallyStore'
import { useVehicleStore } from '../store/useVehicleStore'
import * as sallyLiveClient from '../services/sallyLiveClient'

export function useSallyLive() {
  const setLiveSessionState = useSallyStore(s => s.setLiveSessionState)
  const setLiveConnected    = useSallyStore(s => s.setLiveConnected)

  // Audio capture
  const captureCtxRef      = useRef(null)
  const streamRef          = useRef(null)
  const captureAnalyserRef = useRef(null)

  // Audio playback (24kHz — Gemini output rate)
  const playCtxRef         = useRef(null)
  const pcmQueueRef        = useRef([])
  const activeSourcesRef   = useRef([])
  const scheduledUntilRef  = useRef(0)
  const schedRafRef        = useRef(null)
  const isSpeakingRef      = useRef(false)

  // VAD
  const vadRef = useRef(null)

  // Stable refs to listeners for cleanup
  const handleBinaryRef = useRef(null)
  const handleJsonRef   = useRef(null)

  // ── Gapless PCM playback ────────────────────────────────────────────────────

  const scheduleNextChunk = useCallback(() => {
    const ctx = playCtxRef.current
    if (!ctx) return

    const LOOKAHEAD = 0.1 // 100ms scheduling window

    while (
      pcmQueueRef.current.length > 0 &&
      scheduledUntilRef.current < ctx.currentTime + LOOKAHEAD
    ) {
      const int16   = pcmQueueRef.current.shift()
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767)
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)

      const startAt = Math.max(scheduledUntilRef.current, ctx.currentTime)
      source.start(startAt)
      scheduledUntilRef.current = startAt + audioBuffer.duration
      activeSourcesRef.current.push(source)

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source)
      }
    }

    if (pcmQueueRef.current.length > 0 || activeSourcesRef.current.length > 0) {
      schedRafRef.current = requestAnimationFrame(scheduleNextChunk)
    } else {
      isSpeakingRef.current = false
    }
  }, [])

  const cancelPlayback = useCallback(() => {
    if (schedRafRef.current) {
      cancelAnimationFrame(schedRafRef.current)
      schedRafRef.current = null
    }
    for (const source of activeSourcesRef.current) {
      try { source.stop() } catch {}
    }
    activeSourcesRef.current = []
    pcmQueueRef.current      = []
    if (playCtxRef.current) {
      scheduledUntilRef.current = playCtxRef.current.currentTime
    }
    isSpeakingRef.current = false
  }, [])

  // ── Message handlers ────────────────────────────────────────────────────────

  const handleBinary = useCallback((buffer) => {
    const int16 = new Int16Array(buffer)
    pcmQueueRef.current.push(int16)
    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true
      schedRafRef.current   = requestAnimationFrame(scheduleNextChunk)
    }
  }, [scheduleNextChunk])

  const handleJson = useCallback((msg) => {
    const vehicle = useVehicleStore.getState()
    const sally   = useSallyStore.getState()

    switch (msg.type) {
      case 'LIVE_READY':
        sally.setLiveConnected(true)
        break
      case 'LIVE_STATE':
        sally.setLiveSessionState(msg.payload.state)
        break
      case 'SET_INSIDE_LIGHT':
        vehicle.setAmbientLight(msg.payload.color)
        break
      case 'SET_STEERING_WHEEL':
        vehicle.setSteering(msg.payload.position)
        break
      case 'SET_SEAT_DRIVER':
        vehicle.setSeatDriver(msg.payload.position)
        break
      case 'SET_SEAT_PASSENGER':
        vehicle.setSeatPassenger(msg.payload.position)
        break
      case 'SET_CABIN_TEMPERATURE':
        vehicle.setTemperature(msg.payload.degrees)
        break
      case 'LIVE_ERROR':
        console.error('[Sally Live]', msg.payload?.msg)
        sally.setLiveSessionState('idle')
        sally.setLiveConnected(false)
        break
      default:
        break
    }
  }, [])

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (vadRef.current) {
      try { vadRef.current.destroy() } catch {}
      vadRef.current = null
    }

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    captureCtxRef.current?.close().catch(() => {})
    captureCtxRef.current    = null
    captureAnalyserRef.current = null

    playCtxRef.current?.close().catch(() => {})
    playCtxRef.current = null

    if (handleBinaryRef.current) {
      sallyLiveClient.removeBinaryListener(handleBinaryRef.current)
      handleBinaryRef.current = null
    }
    if (handleJsonRef.current) {
      sallyLiveClient.removeJSONListener(handleJsonRef.current)
      handleJsonRef.current = null
    }
  }, [])

  // ── Session lifecycle ────────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    setLiveSessionState('connecting')

    try {
      // 1. Playback context at 24kHz (Gemini output rate).
      //    resume() MUST be called synchronously in this click-event handler.
      const playCtx = new AudioContext({ sampleRate: 24000 })
      await playCtx.resume()
      playCtxRef.current        = playCtx
      scheduledUntilRef.current = playCtx.currentTime

      // 2. Capture mic stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
        video: false,
      })
      streamRef.current = stream

      // 3. Capture context at 16kHz (Gemini input rate)
      const captureCtx = new AudioContext({ sampleRate: 16000 })
      captureCtxRef.current = captureCtx

      // 4. Load AudioWorklet processor
      await captureCtx.audioWorklet.addModule('/audio-capture-worklet.js')

      // 5. Wire audio pipeline
      const sourceNode  = captureCtx.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(captureCtx, 'pcm-capture-processor')
      const analyser    = captureCtx.createAnalyser()
      analyser.fftSize  = 256
      sourceNode.connect(workletNode)
      sourceNode.connect(analyser)
      captureAnalyserRef.current = analyser

      // 6. Forward PCM chunks to backend via /ws/sally
      workletNode.port.onmessage = (event) => {
        sallyLiveClient.sendBinary(event.data)
      }

      // 7. VAD only for instant barge-in detection.
      //    Server-side VAD on Gemini Live handles turn boundaries — sending
      //    ACTIVITY_START/END here would conflict and tear down the session.
      try {
        const { MicVAD } = await import('@ricky0123/vad-web')
        const vad = await MicVAD.new({
          onSpeechStart: () => {
            if (isSpeakingRef.current) {
              cancelPlayback()
              sallyLiveClient.sendJSON({ type: 'INTERRUPT' })
            }
          },
        })
        vad.start()
        vadRef.current = vad
      } catch (err) {
        console.warn('[VAD] Init failed, proceeding without barge-in:', err)
      }

      // 8. Register message handlers before connecting WS
      handleBinaryRef.current = handleBinary
      handleJsonRef.current   = handleJson
      sallyLiveClient.addBinaryListener(handleBinary)
      sallyLiveClient.addJSONListener(handleJson)

      // 9. Open /ws/sally WebSocket
      sallyLiveClient.connectSallyLive(
        () => {
          sallyLiveClient.sendJSON({
            type: 'SESSION_START',
            payload: { session_id: crypto.randomUUID() },
          })
        },
        () => {
          setLiveSessionState('idle')
          setLiveConnected(false)
          cleanup()
        },
      )

    } catch (err) {
      console.error('[Sally Live] Failed to start session:', err)
      setLiveSessionState('idle')
      cleanup()
    }
  }, [handleBinary, handleJson, cancelPlayback, cleanup, setLiveSessionState, setLiveConnected])

  const endSession = useCallback(() => {
    cancelPlayback()
    sallyLiveClient.sendJSON({ type: 'SESSION_END' })
    sallyLiveClient.disconnectSallyLive()
    cleanup()
    setLiveSessionState('idle')
    setLiveConnected(false)
  }, [cancelPlayback, cleanup, setLiveSessionState, setLiveConnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
      sallyLiveClient.disconnectSallyLive()
    }
  }, [cleanup])

  return {
    startSession,
    endSession,
    captureAnalyserRef,
  }
}
