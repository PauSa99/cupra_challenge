import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import { applyMat } from './utils'
import SteeringWheel from './SteeringWheel'

function DashboardBody({ mat }) {
  const { scene } = useGLTF('/models/car_dashboard.glb')
  useEffect(() => applyMat(scene, mat), [scene, mat])
  return <primitive object={scene} />
}

function PanoramicScreen() {
  const { scene } = useGLTF('/models/full_screen.glb')
  const tex = useTexture('/projections/tablet_image.jpg')

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    map:        tex,
    toneMapped: false,
  }), [tex])

  useEffect(() => { applyMat(scene, mat) }, [scene, mat])

  return (
    <primitive
      object={scene}
      position={[0.05, 0.17, 0.25]}
      rotation={[-0.5, 0, 0]}
      scale={[0.009, 0.009, 0.009]}
    />
  )
}

export default function Dashboard({ dashMat, steeringMat }) {
  return (
    <group position={[0, 0.5, 1]} rotation={[0, Math.PI, 0]}>
      <DashboardBody mat={dashMat} />
      <PanoramicScreen />
      <group position={[-0.5, 0.2, 0.20]} rotation={[0.5, -0.5, 0.1]} scale={0.2}>
        <SteeringWheel mat={steeringMat} />
      </group>
    </group>
  )
}

useGLTF.preload('/models/car_dashboard.glb')
useGLTF.preload('/models/full_screen.glb')
