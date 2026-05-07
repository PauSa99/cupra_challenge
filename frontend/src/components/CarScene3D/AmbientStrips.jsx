import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useVehicleStore } from '../../store/useVehicleStore'
import { AMBIENT_COLORS } from './constants'

// Each entry: strip geometry + a point light offset inward to illuminate nearby surfaces.
// Positions match a real compact car interior (CUPRA Born proportions, 1 unit ≈ 1 m).
const STRIPS = [
  // Left door panel — elbow height, full door length
  {
    pos:      [-0.85, 0.28,  0.10],
    dims:     [0.012, 0.012, 1.40],
    lightPos: [-0.60, 0.28,  0.10],
    li: 0.65, ld: 0.95,
  },
  // Right door panel
  {
    pos:      [ 0.85, 0.28,  0.10],
    dims:     [0.012, 0.012, 1.40],
    lightPos: [ 0.60, 0.28,  0.10],
    li: 0.65, ld: 0.95,
  },
  // Footwell — under dashboard, illuminates floor and pedal area
  {
    pos:      [ 0.0,  0.05, 0.6],
    dims:     [0.80,  0.008, 0.012],
    lightPos: [ 0.0,  0.20, 0.6],
    li: 0.40, ld: 0.70,
  },
  {
    pos:      [ 0.0,  0.05, -0.38],
    dims:     [0.80,  0.008, 0.012],
    lightPos: [ 0.0,  0.20, -0.38],
    li: 0.40, ld: 0.70,
  },
  {
    pos:      [ 0.0,  0.05, -1.36],
    dims:     [0.80,  0.008, 0.012],
    lightPos: [ 0.0,  0.20, -1.36],
    li: 0.40, ld: 0.70,
  },
  // Dashboard top edge — grazes light over the dash surface toward occupants
  {
    pos:      [ 0.0,  0.48, -1.3],
    dims:     [1.30,  0.008, 0.012],
    lightPos: [ 0.0,  0.36, -1.2],
    li: 0.50, ld: 0.85,
  },
]

export default function AmbientStrips() {
  const ambientColor = useVehicleStore(s => s.ambientColor)
  const cur       = useRef([...AMBIENT_COLORS.off])
  const matRefs   = useRef([])
  const lightRefs = useRef([])

  useFrame(() => {
    const tgt = AMBIENT_COLORS[ambientColor] ?? AMBIENT_COLORS.off
    cur.current = cur.current.map((v, i) => THREE.MathUtils.lerp(v, tgt[i], 0.03))
    const [r, g, b] = cur.current
    const brightness = (r + g + b) / 3

    matRefs.current.forEach(m => {
      if (!m) return
      m.emissive.setRGB(r, g, b)
      m.color.setRGB(r * 0.12, g * 0.12, b * 0.12)
    })

    lightRefs.current.forEach((l, i) => {
      if (!l) return
      l.color.setRGB(r, g, b)
      // Scale intensity with color brightness so "off" is nearly dark
      l.intensity = STRIPS[i].li * (0.15 + brightness * 0.85)
    })
  })

  return (
    <>
      {STRIPS.map((s, i) => (
        <group key={i}>
          {/* Visible LED strip — emissive, bloom-reactive */}
          <mesh position={s.pos}>
            <boxGeometry args={s.dims} />
            <meshStandardMaterial
              ref={m => { matRefs.current[i] = m }}
              color="#0d0604"
              emissive="#C8713A"
              emissiveIntensity={3.8}
              toneMapped={false}
              roughness={0.06}
            />
          </mesh>

          {/* Point light that actually illuminates surfaces near the strip */}
          <pointLight
            ref={l => { lightRefs.current[i] = l }}
            position={s.lightPos}
            intensity={s.li}
            distance={s.ld}
            decay={2}
          />
        </group>
      ))}
    </>
  )
}
