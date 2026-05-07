import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useVehicleStore } from '../../store/useVehicleStore'
import { AMBIENT_COLORS } from './constants'

export default function SallyLighting() {
  const ambientColor = useVehicleStore(s => s.ambientColor)
  const cur = useRef([...AMBIENT_COLORS.off])
  const topRef  = useRef()
  const fillRef = useRef()
  const rimRef  = useRef()

  useFrame(() => {
    const tgt = AMBIENT_COLORS[ambientColor] ?? AMBIENT_COLORS.off
    cur.current = cur.current.map((v, i) => v + (tgt[i] - v) * 0.03)
    const [r, g, b] = cur.current

    if (topRef.current)  topRef.current.color.setRGB(r, g, b)
    if (fillRef.current) fillRef.current.color.setRGB(r * 0.35, g * 0.35, b * 0.35)
    if (rimRef.current)  rimRef.current.color.setRGB(0.6 + r * 0.3, 0.6 + g * 0.15, 0.7 + b * 0.2)
  })

  return (
    <>
      <pointLight ref={topRef}  position={[0, 1.1, 0]}      intensity={2.4} distance={4.0} decay={2} />
      <pointLight ref={fillRef} position={[0, 0.08, 0.4]}   intensity={0.8} distance={2.4} decay={2} />
      <pointLight ref={rimRef}  position={[-2.0, 2.2, 2.5]} intensity={1.6} distance={8}   decay={2} />
      <directionalLight position={[-1, 3, -4]} intensity={0.6} castShadow
        shadow-mapSize={[1024, 1024]}
      />
    </>
  )
}
