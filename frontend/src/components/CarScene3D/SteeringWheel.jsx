import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useVehicleStore } from '../../store/useVehicleStore'
import { applyMat } from './utils'

// k=14, d=7, m=0.8 → eigenvalues -3.09 / -5.66 → settling ~1.5 s (overdamped, no bounce)
const SP = { k: 14, d: 7, m: 0.8 }

function stepSpring(p, v, target, { k, d, m }, dt) {
  const nv = v + ((target - p) * k - v * d) / m * dt
  return [p + nv * dt, nv]
}

export default function SteeringWheel({ mat }) {
  const { scene }  = useGLTF('/models/steering_wheel.glb')
  const steering   = useVehicleStore(s => s.steering)
  const groupRef   = useRef()

  const zSp  = useRef([0, 0])
  const scSp = useRef([1, 0])

  useEffect(() => {
    applyMat(scene, mat)
    mat.transparent = true
  }, [scene, mat])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const dt  = Math.min(delta, 0.05)
    const ret = steering === 'retract'

    const [nZ,  nZv]  = stepSpring(...zSp.current,  ret ? -0.45 : 0,   SP, dt)
    const [nSc, nScv] = stepSpring(...scSp.current, ret ? 0.85  : 1.0, SP, dt)
    zSp.current  = [nZ,  nZv]
    scSp.current = [nSc, nScv]

    groupRef.current.position.z = nZ
    groupRef.current.scale.setScalar(nSc)

    // Opacity fade: 0.05 per-frame lerp → ~1.5 s at 60 fps
    const targetOpacity = ret ? 0 : 1.0
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.05)

    groupRef.current.visible = mat.opacity > 0.001
  })

  return (
    <group position={[0.37, 0.30, -0.45]} rotation={[-0.3, 0, 0]}>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

useGLTF.preload('/models/steering_wheel.glb')
