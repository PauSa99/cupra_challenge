import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { easing } from 'maath'
import { useVehicleStore } from '../../store/useVehicleStore'

function Seat({ basePosition, config, mat, isRightSide = false }) {
  const { scene } = useGLTF('/models/seat.glb')
  const clone = useMemo(() => {
    const c = scene.clone(true)
    c.traverse(n => {
      if (n.isMesh) { n.material = mat; n.castShadow = true }
    })
    return c
  }, [scene, mat])

  const innerRef = useRef()

  useFrame((state, delta) => {
    if (!innerRef.current) return

    // Rotation (Y) and recline (X) via dampE — stable at 180°, no manual velocity needed
    easing.dampE(
      innerRef.current.rotation,
      [config.recline ?? 0, config.rotation ?? 0, 0],
      0.6,
      delta
    )

    // Position offset from basePosition — xOffset spreads outward per side
    const side = isRightSide ? 1 : -1
    const bob  = Math.sin(state.clock.elapsedTime * 1.8) * 0.0015
    easing.damp3(
      innerRef.current.position,
      [(config.xOffset ?? 0) * side, bob, config.zPos ?? 0],
      0.6,
      delta
    )
  })

  // Outer group holds the fixed base position (R3F prop, never touched imperatively).
  // Inner group carries all animated offsets — no re-render conflicts.
  return (
    <group position={basePosition}>
      <group ref={innerRef}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

export default function Seats({ mat }) {
  const { seatDriver, seatPassenger, seatRearLeft, seatRearRight } = useVehicleStore()
  const z = -0.7

  return (
    <>
      <Seat basePosition={[ 0.37, 0, z]}        config={seatRearRight}    mat={mat} isRightSide={true}  />
      <Seat basePosition={[-0.37, 0, z]}        config={seatRearLeft} mat={mat} isRightSide={false} />
      <Seat basePosition={[ 0.37, 0, 0.85 + z]} config={seatDriver} mat={mat} isRightSide={true}  />
      <Seat basePosition={[-0.37, 0, 0.85 + z]} config={seatPassenger}  mat={mat} isRightSide={false} />
    </>
  )
}

useGLTF.preload('/models/seat.glb')
