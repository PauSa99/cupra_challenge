export function applyMat(gltfScene, mat) {
  gltfScene.traverse(n => {
    if (!n.isMesh) return
    n.material      = mat
    n.castShadow    = true
    n.receiveShadow = true
  })
}
