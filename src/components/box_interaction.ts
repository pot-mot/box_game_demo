import { PerspectiveCamera, WebGLRenderer, Raycaster, Vector2, Vector3 } from 'three'
import type { PhysicsContext } from '../types/physics.ts'
import type { PanelContext } from './box_control_panel.ts'

export const setupBoxInteraction = (
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
  physics: PhysicsContext,
  panel: PanelContext,
) => {
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  const forward = new Vector3()
  const SPAWN_DIST = 10
  const CLICK_THRESHOLD = 5

  let pointerDownPos = { x: 0, y: 0 }

  renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button === 0) {
      pointerDownPos = { x: e.clientX, y: e.clientY }
    }
  })

  renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
    if (e.button !== 0) return
    const dx = e.clientX - pointerDownPos.x
    const dy = e.clientY - pointerDownPos.y
    if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) return

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointer, camera)

    const meshes = physics.getBoxMeshes()
    const hits = raycaster.intersectObjects(meshes)
    if (hits.length > 0) {
      const hitMesh = hits[0].object as import('three').Mesh
      const boxes = physics.getBoxes()
      const pb = boxes.find(b => b.mesh === hitMesh)
      if (pb) {
        physics.selectBox(pb.id)
        panel.loadBox(pb.config)
        return
      }
    }
    // click on empty space → deselect
    physics.selectBox(null)
    panel.clearSelection()
  })

  renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault()
    camera.getWorldDirection(forward)
    const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))
    physics.addBox(
      { width: 1, height: 1, depth: 1, mass: 0, friction: 0.3 },
      spawnPos.x,
      spawnPos.y,
      spawnPos.z,
    )
  })
}
