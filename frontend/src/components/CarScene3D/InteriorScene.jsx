import { useCupraMaterials } from './materials'
import CarBody from './CarBody'
import Dashboard from './Dashboard'
import Seats from './Seats'
import FoldableTable from './FoldableTable'
import AmbientStrips from './AmbientStrips'
import WindowProjections from './WindowProjections'

export default function InteriorScene() {
  const mats = useCupraMaterials()

  return (
    <group>
      <CarBody     mat={mats.shell} />
      <WindowProjections />
      <Dashboard   dashMat={mats.dash} steeringMat={mats.steering} />
      <Seats       mat={mats.seat} />
      <FoldableTable mat={mats.table} />
      <AmbientStrips />
    </group>
  )
}
