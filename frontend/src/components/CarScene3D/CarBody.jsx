import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'

export default function CarBody({ mat }) {
  const { scene } = useGLTF('/models/car_shell.glb')

  useEffect(() => {
    scene.traverse(n => {
      if (!n.isMesh) return
      n.material      = mat
      n.castShadow    = true
      n.receiveShadow = true
      n.renderOrder   = 1
    })
  }, [scene, mat])

  return <primitive object={scene} />
}

useGLTF.preload('/models/car_shell.glb')
