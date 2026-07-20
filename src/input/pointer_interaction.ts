import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {focusPanel} from '../ui/entity_control_panel.ts'

export type SpawnMode = 'box/common' | 'box/destruction' | 'box/water' | 'box/burning'

export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    sources: EntityInfoSource[],
    getSpawnMode: () => SpawnMode,
): void => {
    const sourcesByType = new Map(sources.map(s => [s.type, s]))
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

        const allMeshes = sources.flatMap(s => s.getMeshes())
        if (allMeshes.length === 0) {
            sources.forEach(s => s.select(undefined))
            focusPanel(undefined)
            return
        }

        const hits = raycaster.intersectObjects(allMeshes, false)
        if (hits.length > 0) {
            const hitMesh = hits[0].object as Mesh

            for (const source of sources) {
                const entity = source.getEntityList().find(e => e.mesh === hitMesh)
                if (entity) {
                    sources.forEach(s => s.select(undefined))
                    source.select(entity.id)
                    focusPanel(source.panel)
                    return
                }
            }
        }

        sources.forEach(s => s.select(undefined))
        focusPanel(undefined)
    })

    renderer.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault()
        camera.getWorldDirection(forward)
        const spawnPos = new Vector3().copy(camera.position).add(forward.clone().multiplyScalar(SPAWN_DIST))

        const mode = getSpawnMode()
        const source = sourcesByType.get(mode)
        if (source) {
            source.spawnAt(spawnPos.x, spawnPos.y, spawnPos.z)
        }
    })
}
