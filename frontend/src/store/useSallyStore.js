import { create } from 'zustand'
import { useVehicleStore } from './useVehicleStore'
import { useEcosystemStore } from './useEcosystemStore'

export const useSallyStore = create((set) => ({
  connected:        false,
  sallyLog:         [],
  isListening:      false,
  sallyIsSpeaking:  false,
  conversation:     [],
  lastReasoning:    '',
  isThinking:       false,
  streamingText:    '',
  liveSessionState: 'idle',   // 'idle'|'connecting'|'listening'|'processing'|'speaking'
  liveConnected:    false,

  addToLog: (text) =>
    set((state) => ({
      sallyLog: [
        { text, timestamp: new Date().toLocaleTimeString() },
        ...state.sallyLog,
      ].slice(0, 50),
    })),

  addConversationTurn: (role, text) =>
    set((state) => ({
      conversation: [
        ...state.conversation,
        { role, text, timestamp: new Date().toLocaleTimeString() },
      ].slice(-20),
    })),

  setConnected:          (v) => set({ connected: v }),
  setLiveSessionState:   (s) => set({ liveSessionState: s }),
  setLiveConnected:      (v) => set({ liveConnected: v }),
  setListening:          (v) => set({ isListening: v }),
  setSallyIsSpeaking:    (v) => set({ sallyIsSpeaking: v }),
  setIsThinking:         (v) => set({ isThinking: v }),
  clearStreaming:         ()  => set({ isThinking: false, streamingText: '' }),
  appendStreamingText:   (chunk) => set((s) => ({ streamingText: s.streamingText + chunk })),

  // Acción maestra — distribuye el payload del backend a los tres stores
  applySallyAction: (payload) => {
    const vehicle = useVehicleStore.getState()
    vehicle.setAmbientLight(payload.ambient_color ?? 'off')
    vehicle.setSteering(payload.steering ?? 'extend')
    vehicle.setSeatDriver(payload.seat_driver)
    vehicle.setSeatPassenger(payload.seat_passenger)
    vehicle.setTemperature(payload.temperature ?? 22)
    if (payload.table_open !== undefined) vehicle.setTableOpen(payload.table_open)

    if (payload.ecosystem) {
      useEcosystemStore.getState().updateEcosystem(payload.ecosystem)
    }

    set({ lastReasoning: payload.reasoning ?? '' })
  },
}))
