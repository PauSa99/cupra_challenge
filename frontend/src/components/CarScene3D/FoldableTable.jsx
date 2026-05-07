import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { applyMat } from './utils'

import { useVehicleStore } from '../../store/useVehicleStore'

const BASE_SCALE = 0.05

// Arm lifts first (slightly faster, ~0.9 s) so the surface appears to unfold sequentially
// k=50, d=12, m=0.5 → eigenvalues -5.37 / -18.63 → settling ~0.9 s (overdamped)
const Y_SP = { k: 50, d: 12, m: 0.5 }

// Table surface open/close scale: ~1.5 s
// k=19, d=10, m=1.2 → eigenvalues -2.93 / -5.4 → settling ~1.57 s (overdamped)
const SC_SP = { k: 19, d: 10, m: 1.2 }

// Size & position springs: slightly underdamped (ζ ≈ 0.79) for a fluid, organic feel
// k=12, d=6, m=1.2 → ωn=3.16, ωd=2.6, settling ~1.6 s
const SIZE_SP = { k: 12, d: 6, m: 1.2 }

function step(p, v, target, { k, d, m }, dt) {
  const nv = v + ((target - p) * k - v * d) / m * dt
  return [p + nv * dt, nv]
}

export default function FoldableTable({ mat }) {
  const { scene } = useGLTF('/models/foldable_table.glb')
  const ref = useRef()

  const openFromStore = useVehicleStore(s => s.tableOpen)
  const tableConfig   = useVehicleStore(s => s.tableConfig)

  const open = openFromStore ?? false
  const { posZ = -0.28, sizeX = 1, sizeY = 1, sizeZ = 1 } = tableConfig || {}

  // Arm lift + base scale (open/close)
  const yS  = useRef([0, 0])
  const scS = useRef([0.001, 0])

  // Independent springs for each dimension — initialized to the store's starting values
  // so there is no snap on first render
  const szXS = useRef([sizeX, 0])
  const szYS = useRef([sizeY, 0])
  const szZS = useRef([sizeZ, 0])
  const pzS  = useRef([posZ, 0])

  useEffect(() => applyMat(scene, mat), [scene, mat])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)

    // Arm + surface open/close
    const [nY,  nYv]  = step(yS.current[0],  yS.current[1],  open ? 0.15 : 0,          Y_SP,  dt)
    const [nSc, nScv] = step(scS.current[0], scS.current[1], open ? BASE_SCALE : 0.001, SC_SP, dt)
    yS.current  = [nY,  nYv]
    scS.current = [nSc, nScv]

    // Size & position — spring-interpolated so config changes are fluid, not instant
    const [nSzX, nSzXv] = step(szXS.current[0], szXS.current[1], sizeX, SIZE_SP, dt)
    const [nSzY, nSzYv] = step(szYS.current[0], szYS.current[1], sizeY, SIZE_SP, dt)
    const [nSzZ, nSzZv] = step(szZS.current[0], szZS.current[1], sizeZ, SIZE_SP, dt)
    const [nPz,  nPzV]  = step(pzS.current[0],  pzS.current[1],  posZ,  SIZE_SP, dt)
    szXS.current = [nSzX, nSzXv]
    szYS.current = [nSzY, nSzYv]
    szZS.current = [nSzZ, nSzZv]
    pzS.current  = [nPz,  nPzV]

    if (!ref.current) return
    ref.current.position.y = nY
    ref.current.position.z = nPz
    ref.current.scale.set(BASE_SCALE * nSzX, nSc * nSzY, BASE_SCALE * nSzZ)
    ref.current.visible = nSc > 0.004
  })

  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/foldable_table.glb')
