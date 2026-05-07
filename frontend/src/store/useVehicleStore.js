import { create } from 'zustand'

export const SEAT_PRESETS = {
  normal:   { rotation: 0,       recline: 0,     zPos: 0, xOffset: 0 },
  reclined: { rotation: 0,       recline: -0.32, zPos: 0, xOffset: 0 },
  rotated:  { rotation: Math.PI, recline: 0,     zPos: 0, xOffset: 0 },
}

export const TABLE_PRESETS = {
  standard_closed: { posZ: -0.28, sizeX: 1,    sizeY: 1,   sizeZ: 1 },
  meeting_large:   { posZ: -0.28, sizeX: 2.95, sizeY: 1.85, sizeZ: 1.30 },
  friends_open:    { posZ: -0.2,  sizeX: 1,    sizeY: 1.3,  sizeZ: 1 },
}

export const CAMERA_VIEWS = {
  // Posición ajustada para no chocar con el techo o el chasis
  OVERVIEW:  { label: 'OVERVIEW',  position: [3.5, 2.2, 4.5],    target: [0, 0.5, 0] },
  
  // INTERIOR: Vista desde el centro de los asientos traseros mirando hacia adelante
  INTERIOR:  { label: 'INTERIOR',  position: [0, 1.2, -1.2],     target: [0, 1.2, -1.2] },
  
  // DRIVER: Ajustado para estar a la altura de los ojos del conductor (lado izquierdo)
  DRIVER:    { label: 'DRIVER',    position: [0.4, 1.0, -0.2],   target: [0.4, 1.0, -0.2] },
  
  // REAR: Mirando hacia la parte de atrás desde el parabrisas
  REAR:      { label: 'REAR',      position: [0, 1.1, 1.8],      target: [0, 1.1, 1.8] },
}

{/*
export const CAMERA_VIEWS = {
  OVERVIEW:  { label: 'OVERVIEW',  position: [3.5, 2.2, 4.5],    target: [0, 0.5, 0] },
  INTERIOR:  { label: 'INTERIOR',  position: [0, 1.4, -2.5],     target: [0, 0.6, 0.6] },
  DRIVER:    { label: 'DRIVER',    position: [-0.45, 1.0, -0.6], target: [0, 0.75, 0.9] },
  DASHBOARD: { label: 'DASH',      position: [0, 1.0, -0.5],     target: [0, 0.85, 0.9] },
  REAR:      { label: 'REAR',      position: [0, 1.2, 2.0],      target: [0, 0.5, -1.5] },
  TOP:       { label: 'TOP',       position: [0, 4.5, 0.01],     target: [0, 0, 0] },
}
  */}

export const PROJECTION_PRESETS = {
  OFF:         { label: 'OFF',     url: null },
  MOUNTAINS:   { label: 'MOUNT',   url: '/projections/mountains.mp4' },
  SUNSET:      { label: 'SUNSET',  url: '/projections/sunset.mp4' },
  PRESENTACIO: { label: 'PRESENT', url: '/projections/presentacio.mp4' },
}

const ALL_OFF    = { left: 'OFF', right: 'OFF', front: 'OFF' }
const ALL_MOUNT  = { left: 'MOUNTAINS',   right: 'MOUNTAINS',   front: 'MOUNTAINS' }
const ALL_SUNSET = { left: 'SUNSET',      right: 'SUNSET',      front: 'SUNSET' }
const ALL_PRES   = { left: 'PRESENTACIO', right: 'PRESENTACIO', front: 'PRESENTACIO' }

export const INTERIOR_MODES = {
  MODO_REUNION: {
    steering:      'retract',
    seatDriver:    { ...SEAT_PRESETS.rotated,  zPos: 0.2 },
    seatPassenger: { ...SEAT_PRESETS.rotated,  zPos: 0.2 },
    seatRearLeft:  { ...SEAT_PRESETS.normal,   zPos: -0.2 },
    seatRearRight: { ...SEAT_PRESETS.normal,   zPos: -0.2 },
    tableOpen:     true,
    tableConfig:   TABLE_PRESETS.meeting_large,
    ambientColor:  'green',
    windows:       ALL_PRES,
  },
  MODO_CONDUCCION: {
    steering:      'extend',
    seatDriver:    { ...SEAT_PRESETS.normal, zPos: 0.16 },
    seatPassenger: { ...SEAT_PRESETS.normal, zPos: 0.16 },
    seatRearLeft:  SEAT_PRESETS.normal,
    seatRearRight: SEAT_PRESETS.normal,
    tableOpen:     false,
    tableConfig:   TABLE_PRESETS.standard_closed,
    ambientColor:  'blue',
    windows:       ALL_OFF,
  },
  MODO_RELAX: {
    steering:      'retract',
    seatDriver:    { ...SEAT_PRESETS.reclined, rotation: -0.2, xOffset: 0.15 },
    seatPassenger: { ...SEAT_PRESETS.reclined, rotation: 0.2,  xOffset: 0.15 },
    seatRearLeft:  { ...SEAT_PRESETS.reclined, rotation: 0.1 },
    seatRearRight: { ...SEAT_PRESETS.reclined, rotation: -0.1},
    tableOpen:     false,
    tableConfig:   TABLE_PRESETS.standard_closed,
    ambientColor:  'amber',
    windows:       ALL_SUNSET,
  },
  MODO_AMICS: {
    steering:      'retract',
    seatDriver:    { ...SEAT_PRESETS.normal, rotation: -2.47, xOffset: 0.05, zPos: 0.1 },
    seatPassenger: { ...SEAT_PRESETS.normal, rotation: 2.47,  xOffset: 0.05, zPos: 0.1 },
    seatRearLeft:  { ...SEAT_PRESETS.normal, rotation: 0.67,  xOffset: 0.05 },
    seatRearRight: { ...SEAT_PRESETS.normal, rotation: -0.67, xOffset: 0.05 },
    tableOpen:     true,
    tableConfig:   TABLE_PRESETS.friends_open,
    ambientColor:  'red',
    windows:       ALL_MOUNT,
  }
}

export const useVehicleStore = create((set) => ({
  ...INTERIOR_MODES.MODO_CONDUCCION,
  temperature: 22,
  activeMode:  'MODO_CONDUCCION',
  activeView:  'OVERVIEW',

  setInteriorMode: (modeName) => {
    const key  = modeName.toUpperCase()
    const mode = INTERIOR_MODES[key]
    if (mode) set({ ...mode, activeMode: key })
  },

  setAmbientLight:  (color) => set({ ambientColor: color, activeMode: null }),
  setSteering:      (pos)   => set({ steering:     pos,   activeMode: null }),
  setTemperature:   (deg)   => set({ temperature:  deg,   activeMode: null }),
setSeatDriver:    (v)     => set({ seatDriver:    v,    activeMode: null }),
  setSeatPassenger: (v)     => set({ seatPassenger: v,    activeMode: null }),
  setSeatRearLeft:  (v)     => set({ seatRearLeft:  v,    activeMode: null }),
  setSeatRearRight: (v)     => set({ seatRearRight: v,    activeMode: null }),
  setTableOpen:     (bool)  => set({ tableOpen:     bool, activeMode: null }),
  setTableConfig:   (patch) => set(s => ({ tableConfig: { ...s.tableConfig, ...patch }, activeMode: null })),

  // Fija el preset de una sola ventana: key = 'left' | 'right' | 'front'
  setWindowPreset: (win, preset) =>
    set(s => ({ windows: { ...s.windows, [win]: preset }, activeMode: null })),

  setActiveView: (key) => set({ activeView: key }),
}))
