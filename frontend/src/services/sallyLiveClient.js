// Singleton WebSocket client for the /ws/sally audio bridge.
// Handles binary (PCM audio) and JSON (control) frames on the same socket.

import { wsBase } from './origin'

const SALLY_LIVE_URL =
  import.meta.env.VITE_WS_SALLY_URL || wsBase('/ws/sally', 'ws://localhost:3001/ws/sally')

let socket = null
const binaryListeners = new Set()
const jsonListeners   = new Set()

export function connectSallyLive(onOpen, onClose) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  socket = new WebSocket(SALLY_LIVE_URL)
  socket.binaryType = 'arraybuffer'

  socket.onopen = () => onOpen?.()

  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      binaryListeners.forEach(fn => fn(event.data))
    } else if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data)
        jsonListeners.forEach(fn => fn(msg))
      } catch {}
    }
  }

  socket.onclose = () => {
    onClose?.()
    socket = null
  }

  socket.onerror = (err) => {
    console.error('[SallyLive] WebSocket error', err)
  }
}

export function disconnectSallyLive() {
  socket?.close()
  socket = null
}

export function sendJSON(obj) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj))
  }
}

export function sendBinary(buffer) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(buffer)
  }
}

export function addBinaryListener(fn)    { binaryListeners.add(fn) }
export function removeBinaryListener(fn) { binaryListeners.delete(fn) }
export function addJSONListener(fn)      { jsonListeners.add(fn) }
export function removeJSONListener(fn)   { jsonListeners.delete(fn) }
