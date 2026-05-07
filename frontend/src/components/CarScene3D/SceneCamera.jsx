import { useRef, useEffect } from 'react'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import { useVehicleStore, CAMERA_VIEWS } from '../../store/useVehicleStore'

export default function SceneCamera() {
  const activeView = useVehicleStore(s => s.activeView)
  const config     = CAMERA_VIEWS[activeView] ?? CAMERA_VIEWS.OVERVIEW
  const isOverview = activeView === 'OVERVIEW'

  const camRef      = useRef()
  const controlsRef = useRef()

  useEffect(() => {
    if (!camRef.current || !controlsRef.current) return
    
    // Sincronizamos posición y target manualmente al cambiar de vista
    camRef.current.position.set(...config.position)
    controlsRef.current.target.set(...config.target)
    controlsRef.current.update()
  }, [activeView, config])

  return (
    <>
      <PerspectiveCamera
        ref={camRef}
        makeDefault
        position={config.position}
        fov={42}
      />
      <OrbitControls
        ref={controlsRef}
        target={config.target}
        enableDamping
        dampingFactor={0.08}
        
        // RESTRICCIONES DE MOVILIDAD
        enablePan={isOverview}   // Solo OVERVIEW permite desplazamiento (click derecho)
        enableZoom={true}        // Permitimos zoom en todas las vistas
        enableRotate={true}      // Permitimos rotación en todas las vistas
        
        // LIMITACIONES DE ZOOM (Evita que la cámara atraviese el coche en interior)
        minDistance={isOverview ? 0.5 : 0.1}
        maxDistance={isOverview ? 10  : 2}
      />
    </>
  )
}