import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {CommonContext} from '../common_box/types/physics.ts'
import type {DestructionContext} from '../destruction_box/types/destruction.ts'
import type {PanelContext} from '../types/ui.ts'
import type {DestructionPanelContext} from '../ui/destruction_panel.ts'
import type {WaterBoxContext, WaterPanelContext} from '../water_block/types/water.ts'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {DEFAULT_MAX_HEALTH} from '../destruction_box/physics/constants.ts'
import {DEFAULT_WATER_CONFIG} from '../water_block/constants.ts'

const COMMON_CONFIG = {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3} as const
const DESTR_CONFIG = {
    width: 1, height: 1, depth: 1, mass: 1, friction: 0.3,
    maxHealth: DEFAULT_MAX_HEALTH,
} as const

export type SpawnMode = 'common' | 'destruction' | 'water'

export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    common: CommonContext,
    commonPanel: PanelContext,
    destruction: DestructionContext,
    destructionPanel: DestructionPanelContext,
    water: WaterBoxContext,
    waterPanel: WaterPanelContext,
    getSpawnMode: () => SpawnMode,
): void => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    const forward = new Vector3()
    let pointerDownPos = {x: 0, y: 0}

    renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
        renderer.domElement.focus()
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

        const allMeshes = [...common.getBoxMeshes(), ...destruction.getBoxMeshes(), ...water.getBlockMeshes()]
        if (allMeshes.length === 0) {
            common.selectBox(undefined)
            destruction.select(undefined)
            water.selectBlock(undefined)
            commonPanel.hide()
            destructionPanel.hide()
            waterPanel.hide()
            return
        }

        const hits = raycaster.intersectObjects(allMeshes, false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh

            const wb = water.getBlocks().find(b => b.mesh === hitMesh)
            if (wb) {
                water.selectBlock(wb.id)
                common.selectBox(undefined)
                destruction.select(undefined)
                commonPanel.hide()
                destructionPanel.hide()
                waterPanel.showForBox(wb.config, wb.mesh.position)
                return
            }

            const pb = common.getBoxes().find(b => b.mesh === hitMesh)
            if (pb) {
                common.selectBox(pb.id)
                destruction.select(undefined)
                water.selectBlock(undefined)
                destructionPanel.hide()
                waterPanel.hide()
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
                water.selectBlock(undefined)
                commonPanel.hide()
                waterPanel.hide()
                destructionPanel.showForBox(db.config, db.health, db.config.maxHealth)
                return
            }
        }

        common.selectBox(undefined)
        destruction.select(undefined)
        water.selectBlock(undefined)
        commonPanel.hide()
        destructionPanel.hide()
        waterPanel.hide()
    })

    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))

        const mode = getSpawnMode()
        if (mode === 'common') {
            common.addBox(COMMON_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        } else if (mode === 'destruction') {
            destruction.add(DESTR_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        } else {
            water.addBlock(DEFAULT_WATER_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        }
    })
}
