// SallyPanel — multimodal voice interface for SALLY (Gemini Live API)
import React, { useEffect, useRef } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSallyStore }   from '../../store/useSallyStore'
import { useSallyLive }    from '../../hooks/useSallyLive'
import './SallyPanel.css'

const STATE_LABELS = {
  idle:       '',
  connecting: 'Conectando…',
  listening:  'Escuchando',
  processing: 'Procesando…',
  speaking:   'Hablando',
}

// Waveform canvas driven by AnalyserNode (real mic data) or synthetic animation
function WaveformCanvas({ analyserRef, active, state }) {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    const W      = canvas.width
    const H      = canvas.height

    const COLOR = {
      listening:  '#4caf50',
      processing: '#ffb347',
      speaking:   '#C8713A',
      connecting: '#7f9fdf',
    }

    if (!active) {
      ctx.clearRect(0, 0, W, H)
      return
    }

    const analyser = analyserRef?.current
    const bufLen   = analyser ? analyser.frequencyBinCount : 64
    const data     = new Uint8Array(bufLen)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const color = COLOR[state] || '#C8713A'

      if (analyser) {
        analyser.getByteFrequencyData(data)
      } else {
        const t = Date.now() / 250
        for (let i = 0; i < bufLen; i++) {
          data[i] = Math.abs(Math.sin(t + i * 0.25) * 100 + 30)
        }
      }

      ctx.clearRect(0, 0, W, H)
      const barW = W / bufLen - 1
      for (let i = 0; i < bufLen; i++) {
        const barH = (data[i] / 255) * H * 0.85
        ctx.fillStyle = color
        ctx.fillRect(i * (barW + 1), H - barH, barW, barH)
      }
    }

    draw()
    return () => {
      cancelAnimationFrame(rafRef.current)
      ctx.clearRect(0, 0, W, H)
    }
  }, [active, state, analyserRef])

  return <canvas ref={canvasRef} width={280} height={60} className="waveform-canvas" />
}

export default function SallyPanel() {
  const { temperature } = useVehicleStore()
  const {
    connected,
    lastReasoning,
    sallyLog,
    conversation,
    liveSessionState,
  } = useSallyStore()

  const { startSession, endSession, captureAnalyserRef } = useSallyLive()

  const isActive     = liveSessionState !== 'idle'
  const isConnecting = liveSessionState === 'connecting'
  const stateLabel   = STATE_LABELS[liveSessionState]

  return (
    <div className="sally-panel">

      {/* Connection status + live state chip */}
      <div className={`panel-status ${connected ? 'online' : 'offline'}`}>
        <span className="status-dot" />
        <span>{connected ? 'Sally online' : 'Conectando…'}</span>
        {isActive && stateLabel && (
          <span className={`live-state-chip state-${liveSessionState}`}>
            {stateLabel}
          </span>
        )}
      </div>

      {/* Waveform visualizer */}
      <div className="sally-waveform-section">
        <WaveformCanvas
          analyserRef={captureAnalyserRef}
          active={isActive}
          state={liveSessionState}
        />
      </div>

      {/* Call / Hang buttons */}
      <div className="sally-controls">
        {!isActive ? (
          <button
            className="btn-call"
            onClick={startSession}
            disabled={!connected}
            title="Iniciar conversación con Sally"
          >
            <span className="btn-icon">📞</span>
            <span>Llamar a Sally</span>
          </button>
        ) : (
          <button
            className="btn-hang"
            onClick={endSession}
            disabled={isConnecting}
            title="Cerrar conversación"
          >
            <span className="btn-icon">📵</span>
            <span>{isConnecting ? 'Conectando…' : 'Colgar'}</span>
          </button>
        )}
      </div>

      {/* Recent conversation turns */}
      {conversation.length > 0 && (
        <div className="panel-conversation">
          <span className="panel-label">Conversación</span>
          <div className="conversation-list">
            {conversation.slice(-4).map((turn, i) => (
              <div key={i} className={`convo-turn convo-${turn.role}`}>
                <span className="convo-role">
                  {turn.role === 'user' ? 'Tú' : 'Sally'}
                </span>
                <span className="convo-text">{turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last proactive decision */}
      {lastReasoning && (
        <div className="panel-reasoning">
          <span className="panel-label">Última decisión</span>
          <p>{lastReasoning}</p>
        </div>
      )}

      {/* Cabin state summary */}
      <div className="panel-state">
        <span className="panel-label">Estado cabina</span>
        <div className="state-row">
          <span className="state-key">Temp. cabina</span>
          <span className="state-val">{temperature}°C</span>
        </div>
      </div>

      {/* Proactive log */}
      <div className="panel-log">
        <span className="panel-label">Historial</span>
        <ul>
          {sallyLog.map((entry, i) => (
            <li key={i} className="log-entry">
              <span className="log-time">{entry.timestamp}</span>
              <span className="log-text">{entry.text}</span>
            </li>
          ))}
        </ul>
      </div>

    </div>
  )
}
