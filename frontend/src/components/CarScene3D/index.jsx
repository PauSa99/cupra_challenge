import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import InteriorScene from './InteriorScene'
import SallyLighting from './SallyLighting'
import SceneCamera from './SceneCamera'
import './CarScene3D.css'

export default function CarScene3D() {
  return (
    <div className="car-scene-wrapper">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, toneMapping: 4, toneMappingExposure: 1.1 }}
      >
        <color attach="background" args={['#060608']} />

        <SceneCamera />

        <Environment preset="warehouse" />
        <ambientLight intensity={0.04} />
        <SallyLighting />

        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.7}
          scale={10}
          blur={2.5}
          far={1.5}
          color="#000000"
        />

        <Suspense fallback={null}>
          <InteriorScene />
        </Suspense>

        <EffectComposer>
          <Bloom
            intensity={1.8}
            luminanceThreshold={0.45}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <Vignette eskil={false} offset={0.18} darkness={0.65} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
