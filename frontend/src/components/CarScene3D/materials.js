import { useMemo } from 'react'
import * as THREE from 'three'

export function useCupraMaterials() {
  return useMemo(() => ({
    shell: new THREE.MeshPhysicalMaterial({
      color:              '#0a1628',
      transparent:        true,
      opacity:            0.12,
      roughness:          0.25,
      metalness:          0.10,
      clearcoat:          0.5,
      clearcoatRoughness: 0.15,
      envMapIntensity:    0.6,
      side:               THREE.DoubleSide,
      depthWrite:         false,
    }),
    dash: new THREE.MeshPhysicalMaterial({
      color:              '#0a0a0e',
      roughness:          0.28,
      metalness:          0.72,
      clearcoat:          0.88,
      clearcoatRoughness: 0.06,
      envMapIntensity:    1.6,
    }),
    steering: new THREE.MeshPhysicalMaterial({
      color:              '#111118',
      roughness:          0.22,
      metalness:          0.78,
      clearcoat:          1.0,
      clearcoatRoughness: 0.04,
      transparent:        true,
      opacity:            1.0,
    }),
    // Leather with enough clearcoat to catch nearby colored point lights
    seat: new THREE.MeshPhysicalMaterial({
      color:              '#1a1a1f',
      roughness:          0.62,
      metalness:          0.12,
      clearcoat:          0.45,
      clearcoatRoughness: 0.55,
    }),
    table: new THREE.MeshPhysicalMaterial({
      color:              '#0e0e14',
      roughness:          0.22,
      metalness:          0.65,
      clearcoat:          0.85,
      clearcoatRoughness: 0.04,
    }),
  }), [])
}
