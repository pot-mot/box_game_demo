import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {CommonEntityContext} from '../entity/box/common/types'
import type {DestructionEntityContext} from '../entity/box/destructed/types'
import type {WaterEntityContext} from '../entity/box/water/types'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {DEFAULT_MAX_HEALTH} from '../entity/box/destructed/physics/constants.ts'
import {DEFAULT_WATER_CONFIG} from '../entity/box/water/physics/constants.ts'
import {focusPanel} from '../ui/panel.ts'

const COMMON_CONFIG = {width: 1, height: 1, depth: 1, mass: 1, friction: 0.3} as const
const DESTR_CONFIG = {
    width: 1, height: 1, depth: 1, mass: 1, friction: 0.3,
    maxHealth: DEFAULT_MAX_HEALTH,
} as const

export type SpawnMode = 'common' | 'destruction' | 'water'

export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    common: CommonEntityContext,
    destruction: DestructionEntityContext,
    water: WaterEntityContext,
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

        const allMeshes = [...common.getMeshes(), ...destruction.getMeshes(), ...water.getMeshes()]
        if (allMeshes.length === 0) {
            common.select(undefined)
            destruction.select(undefined)
            water.select(undefined)
            focusPanel(undefined)
            return
        }

        const hits = raycaster.intersectObjects(allMeshes, false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh

            const wb = water.getAll().find(b => b.mesh === hitMesh)
            if (wb) {
                water.select(wb.id)
                common.select(undefined)
                destruction.select(undefined)
                focusPanel(water.panel)
                return
            }

            const pb = common.getAll().find(b => b.mesh === hitMesh)
            if (pb) {
                common.select(pb.id)
                destruction.select(undefined)
                water.select(undefined)
                focusPanel(common.panel)
                return
            }

            const db = destruction.getAll().find(b => b.mesh === hitMesh)
            if (db) {
                destruction.select(db.id)
                common.select(undefined)
                water.select(undefined)
                focusPanel(destruction.panel)
                return
            }
        }

        common.select(undefined)
        destruction.select(undefined)
        water.select(undefined)
        focusPanel(undefined)
    })

    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))

        const mode = getSpawnMode()
        if (mode === 'common') {
            common.add(COMMON_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        } else if (mode === 'destruction') {
            destruction.add(DESTR_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        } else {
            water.add(DEFAULT_WATER_CONFIG, spawnPos.x, spawnPos.y, spawnPos.z)
        }
    })
}
