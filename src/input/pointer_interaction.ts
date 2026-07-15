import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {CommonContext} from '../common_box/types/physics.ts'
import type {DestructionContext} from '../destruction_box/types/destruction.ts'
import type {PanelContext} from '../types/ui.ts'
import type {DestructionPanelContext} from '../ui/destruction_panel.ts'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {
    DEFAULT_MAX_HEALTH,
    FRAGMENT_SEED_COUNT,
    FRAGMENT_EJECT_FORCE,
} from '../destruction_box/physics/constants.ts'

const COMMON_CONFIG = {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3} as const
const DESTR_CONFIG = {
    width: 1, height: 1, depth: 1, mass: 1, friction: 0.3,
    maxHealth: DEFAULT_MAX_HEALTH,
    fragmentSeedCount: FRAGMENT_SEED_COUNT,
    ejectForce: FRAGMENT_EJECT_FORCE,
} as const

export type SpawnMode = 'common' | 'destruction'

export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    common: CommonContext,
    commonPanel: PanelContext,
    destruction: DestructionContext,
    destructionPanel: DestructionPanelContext,
    getSpawnMode: () => SpawnMode,
): void => {
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

        const allMeshes = [...common.getBoxMeshes(), ...destruction.getBoxMeshes()]
        if (allMeshes.length === 0) {
            common.selectBox(undefined)
            destruction.select(undefined)
            commonPanel.hide()
            destructionPanel.hide()
            return
        }

        const hits = raycaster.intersectObjects(allMeshes, false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh

            const pb = common.getBoxes().find(b => b.mesh === hitMesh)
            if (pb) {
                common.selectBox(pb.id)
                destruction.select(undefined)
                destructionPanel.hide()
                const rotDeg = {
                    x: pb.mesh.rotation.x * 180 / Math.PI,
                    y: pb.mesh.rotation.y * 180 / Math.PI,
                    z: pb.mesh.rotation.z * 180 / Math.PI,
                }
                commonPanel.showForBox(pb.config, pb.mesh.position, rotDeg)
                return
            }

            const db = destruction.getBoxes().find(b => b.mesh === hitMesh)
            if (db) {
                destruction.select(db.id)
                common.selectBox(undefined)
                commonPanel.hide()
                destructionPanel.showForBox(db.config, db.health, db.config.maxHealth)
                return
            }
        }

        common.selectBox(undefined)
        destruction.select(undefined)
        commonPanel.hide()
        destructionPanel.hide()
    })

    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))

        if (getSpawnMode() === 'common') {
            common.addBox(COMMON_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        } else {
            destruction.add(DESTR_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        }
    })
}
