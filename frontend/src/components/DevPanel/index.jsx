import { useState } from 'react'
import {
  useVehicleStore, SEAT_PRESETS, INTERIOR_MODES,
  CAMERA_VIEWS, PROJECTION_PRESETS,
} from '../../store/useVehicleStore'
import { useEcosystemStore } from '../../store/useEcosystemStore'

// Only renders in Vite dev mode — tree-shaken from production build
const COPPER = '#C8713A'
const DARK   = '#0d0b09'
const MID    = '#1a1410'
const ACTIVE = '#2a1e10'

const btn = (active) => ({
  padding: '3px 8px', fontSize: 11, fontFamily: 'monospace',
  border: `1px solid ${active ? COPPER : '#333'}`, borderRadius: 3,
  background: active ? ACTIVE : DARK, color: active ? COPPER : '#555',
  cursor: 'pointer', transition: 'all 0.12s',
})

const tab = (active) => ({
  padding: '3px 9px', fontSize: 10, fontFamily: 'monospace',
  border: `1px solid ${active ? COPPER : '#2a2010'}`, borderRadius: '3px 3px 0 0',
  background: active ? ACTIVE : DARK, color: active ? COPPER : '#444',
  cursor: 'pointer',
})

const modeBtn = (active) => ({
  flex: 1, padding: '7px 4px', fontSize: 10, fontFamily: 'monospace',
  border: `1px solid ${active ? COPPER : '#2a2010'}`, borderRadius: 4,
  background: active ? '#1f1208' : DARK,
  color: active ? COPPER : '#444',
  cursor: 'pointer', transition: 'all 0.15s',
  letterSpacing: 1,
  boxShadow: active ? `0 0 8px ${COPPER}33` : 'none',
})

const MODE_META = {
  MODO_CONDUCCION: { label: 'DRIVING',  icon: '⬛' },
  MODO_REUNION:    { label: 'MEETING',  icon: '⬛' },
  MODO_RELAX:      { label: 'RELAX',    icon: '⬛' },
  MODO_AMICS:      { label: 'AMICS',    icon: '⬛' },
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
      <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', width: 72, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function SliderRow({ label, value, min, max, step, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace', width: 56, flexShrink: 0 }}>
        {label}
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={onChange}
        style={{ flex: 1, accentColor: COPPER, cursor: 'pointer' }}
      />
      <span style={{ color: '#666', fontSize: 9, fontFamily: 'monospace', width: 36, textAlign: 'right' }}>
        {Number(value).toFixed(2)}
      </span>
    </div>
  )
}

function matchesPreset(config, key) {
  const p = SEAT_PRESETS[key]
  return p &&
    config.rotation === p.rotation &&
    config.recline  === p.recline  &&
    config.zPos     === p.zPos     &&
    config.xOffset  === p.xOffset
}

const SEAT_TABS = [
  { id: 'driver',    label: 'DRIVER' },
  { id: 'passenger', label: 'PASS.'  },
  { id: 'rearRight', label: 'REAR R' },
  { id: 'rearLeft',  label: 'REAR L' },
]

export default function DevPanel() {
  const {
    steering, ambientColor, tableOpen, tableConfig, activeMode,
    activeView, windows,
    seatDriver, seatPassenger, seatRearLeft, seatRearRight,
    setInteriorMode,
    setSteering, setAmbientLight, setTableOpen, setTableConfig,
    setSeatDriver, setSeatPassenger, setSeatRearLeft, setSeatRearRight,
    setActiveView, setWindowPreset,
  } = useVehicleStore()
  const { fuelLevel, updateEcosystem } = useEcosystemStore(s => ({ fuelLevel: s.fuelLevel ?? 60, updateEcosystem: s.updateEcosystem }))

  const [open, setOpen]             = useState(true)
  const [activeSeat, setActiveSeat] = useState('driver')

  if (!import.meta.env.DEV) return null

  const seatConfigs = { driver: seatDriver, passenger: seatPassenger, rearRight: seatRearRight, rearLeft: seatRearLeft }
  const seatSetters = { driver: setSeatDriver, passenger: setSeatPassenger, rearRight: setSeatRearRight, rearLeft: setSeatRearLeft }
  const cfg    = seatConfigs[activeSeat]
  const setter = seatSetters[activeSeat]
  const patch  = (key, val) => setter({ ...cfg, [key]: val })

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'block', marginLeft: 'auto', marginBottom: 4,
          padding: '2px 8px', fontSize: 10, background: DARK,
          border: `1px solid ${COPPER}`, color: COPPER,
          borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        DEV {open ? '▾' : '▸'}
      </button>

      {open && (
        <div style={{
          background: MID, border: '1px solid #2a1e10', borderRadius: 5,
          padding: '10px 12px', minWidth: 310,
          boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}>
          <div style={{ color: COPPER, fontSize: 10, marginBottom: 8, letterSpacing: 2 }}>
            SALLY · TEST PANEL
          </div>

          {/* ── Interior Modes ── */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 5,
            }}>
              <span style={{ color: '#555', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
                INTERIOR MODE
              </span>
              {!activeMode && (
                <span style={{ color: '#3a3020', fontSize: 8, fontFamily: 'monospace' }}>
                  CUSTOM
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Object.keys(INTERIOR_MODES).map(key => (
                <button
                  key={key}
                  style={modeBtn(activeMode === key)}
                  onClick={() => setInteriorMode(key)}
                >
                  {MODE_META[key]?.label ?? key}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1f1810', marginBottom: 8 }} />

          {/* ── Global controls ── */}
          <Row label="STEERING">
            {['extend', 'retract'].map(v => (
              <button key={v} style={btn(steering === v)} onClick={() => setSteering(v)}>{v}</button>
            ))}
          </Row>

          <Row label="AMBIENT">
            {['off', 'amber', 'green', 'blue', 'red'].map(v => (
              <button key={v} style={btn(ambientColor === v)} onClick={() => setAmbientLight(v)}>{v}</button>
            ))}
          </Row>

          <Row label="CAMERA">
            {Object.entries(CAMERA_VIEWS).map(([key, v]) => (
              <button
                key={key}
                style={btn(activeView === key)}
                onClick={() => setActiveView(key)}
              >
                {v.label}
              </button>
            ))}
          </Row>

          {[
            { win: 'left',  label: 'WIN LEFT' },
            { win: 'right', label: 'WIN RIGHT' },
            { win: 'front', label: 'WIN FRONT' },
          ].map(({ win, label }) => (
            <Row key={win} label={label}>
              {Object.entries(PROJECTION_PRESETS).map(([key, v]) => (
                <button
                  key={key}
                  style={btn(windows?.[win] === key)}
                  onClick={() => setWindowPreset(win, key)}
                >
                  {v.label}
                </button>
              ))}
            </Row>
          ))}

          <Row label="TABLE">
            <button style={btn(!tableOpen)} onClick={() => setTableOpen(false)}>closed</button>
            <button style={btn( tableOpen)} onClick={() => setTableOpen(true)}>open</button>
          </Row>

          <div style={{ paddingLeft: 8, marginBottom: 2 }}>
            <SliderRow
              label="pos Z"
              value={tableConfig.posZ}
              min={-1} max={1} step={0.01}
              onChange={e => setTableConfig({ posZ: parseFloat(e.target.value) })}
            />
            <SliderRow
              label="size X"
              value={tableConfig.sizeX}
              min={0.2} max={5} step={0.05}
              onChange={e => setTableConfig({ sizeX: parseFloat(e.target.value) })}
            />
            <SliderRow
              label="size Y"
              value={tableConfig.sizeY}
              min={0.2} max={5} step={0.05}
              onChange={e => setTableConfig({ sizeY: parseFloat(e.target.value) })}
            />
            <SliderRow
              label="size Z"
              value={tableConfig.sizeZ}
              min={0.2} max={5} step={0.05}
              onChange={e => setTableConfig({ sizeZ: parseFloat(e.target.value) })}
            />
          </div>

          <Row label="FUEL %">
            {[5, 15, 25, 60, 100].map(v => (
              <button key={v} style={btn(fuelLevel === v)} onClick={() => updateEcosystem({ fuelLevel: v })}>{v}</button>
            ))}
          </Row>

          {/* ── Seat section ── */}
          <div style={{ borderTop: '1px solid #2a1e10', marginTop: 8, paddingTop: 8 }}>
            <div style={{ color: '#555', fontSize: 9, fontFamily: 'monospace', marginBottom: 5, letterSpacing: 1 }}>
              SEATS
            </div>

            <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
              {SEAT_TABS.map(t => (
                <button key={t.id} style={tab(activeSeat === t.id)} onClick={() => setActiveSeat(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{
              border: `1px solid ${ACTIVE}`, borderRadius: '0 3px 3px 3px',
              padding: '8px 8px 4px', background: '#110e0a',
            }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                {Object.entries(SEAT_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    style={btn(matchesPreset(cfg, key))}
                    onClick={() => setter({ ...preset })}
                  >
                    {key === 'rotated' ? '180°' : key}
                  </button>
                ))}
              </div>

              <SliderRow
                label="rotation"
                value={cfg.rotation}
                min={-Math.PI} max={Math.PI} step={0.01}
                onChange={e => patch('rotation', parseFloat(e.target.value))}
              />
              <SliderRow
                label="recline"
                value={cfg.recline}
                min={-0.6} max={0.3} step={0.01}
                onChange={e => patch('recline', parseFloat(e.target.value))}
              />
              <SliderRow
                label="z slide"
                value={cfg.zPos}
                min={-0.8} max={0.8} step={0.01}
                onChange={e => patch('zPos', parseFloat(e.target.value))}
              />
              <SliderRow
                label="x spread"
                value={cfg.xOffset}
                min={0} max={0.45} step={0.01}
                onChange={e => patch('xOffset', parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
