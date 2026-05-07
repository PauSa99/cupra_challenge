import { useVideoTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useVehicleStore, PROJECTION_PRESETS } from '../../store/useVehicleStore'

// side=FrontSide: normal points outward → FrontSide visible from interior (interior is on +normal side)
// front window rotation [-1,0,0]: normal tilts forward/up (outward) → viewer inside is on BackSide
const WINDOW_GEOMETRY = {
  left:  { position: [-0.85, 0.8, -0.3], rotation: [0,  Math.PI / 2, 0], size: [0.8, 0.4], side: THREE.FrontSide },
  right: { position: [ 0.85, 0.8, -0.3], rotation: [0, -Math.PI / 2, 0], size: [0.8, 0.4], side: THREE.FrontSide },
  front: { position: [ 0,    1.0,  0.9], rotation: [-1, 0, 0],           size: [1.1, 0.5], side: THREE.BackSide  },
}

function ProjectionPlane({ url, position, rotation, size, side }) {
  const tex = useVideoTexture(url, { muted: true, loop: true, start: true, playsInline: true })
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        side={side}
        transparent
        opacity={0.95}
      />
    </mesh>
  )
}

function WindowSlot({ win }) {
  const presetKey = useVehicleStore(s => s.windows[win])
  const preset    = PROJECTION_PRESETS[presetKey]
  const geo       = WINDOW_GEOMETRY[win]

  if (!preset?.url) return null
  return <ProjectionPlane key={preset.url} url={preset.url} {...geo} />
}

export default function WindowProjections() {
  return (
    <group>
      <WindowSlot win="left" />
      <WindowSlot win="right" />
      <WindowSlot win="front" />
    </group>
  )
}
