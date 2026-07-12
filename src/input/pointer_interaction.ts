import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {PhysicsContext} from '../types/physics.ts'
import type {PanelContext} from '../types/ui.ts'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'

const DEFAULT_CONFIG = {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3} as const

export function setupPointerInteraction(
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    physics: PhysicsContext,
    panel: PanelContext,
): void {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const forward = new Vector3()
    let pointerDownPos = {x: 0, y: 0}

    renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button === 0) {
            pointerDownPos = {x: e.clientX, y: e.clientY}
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

        const hits = raycaster.intersectObjects(physics.getBoxMeshes(), false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh
            const pb = physics.getBoxes().find(b => b.mesh === hitMesh)
            if (pb) {
                physics.selectBox(pb.id)
                const rotDeg = {
                    x: pb.mesh.rotation.x * 180 / Math.PI,
                    y: pb.mesh.rotation.y * 180 / Math.PI,
                    z: pb.mesh.rotation.z * 180 / Math.PI,
                }
                panel.showForBox(pb.config, pb.mesh.position, rotDeg)
                return
            }
        }
        physics.selectBox(null)
        panel.hide()
    })

    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))
        physics.addBox(DEFAULT_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
    })
}
