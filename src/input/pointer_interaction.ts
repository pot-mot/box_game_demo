import {Raycaster, Vector2, Vector3, type PerspectiveCamera, type WebGLRenderer, type Mesh} from 'three'
import type {SpawnMode} from '../types/spawnMode.ts'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../entity/terrain/base/types'
import {SPAWN_DIST, CLICK_THRESHOLD} from './constants.ts'
import {focusPanel} from '../ui/entity_control_panel.ts'

/**
 * 指针交互（左键选中 + 右键生成 + 滚轮雕刻）。
 * 返回 setEnabled 控制开关，用于编辑/游玩模式切换。
 */
export const setupPointerInteraction = (
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    sources: EntityInfoSource[],
    getSpawnMode: () => SpawnMode,
    terrainSources?: TerrainContext[],
): {setEnabled: (v: boolean) => void} => {
    const sourcesByType = new Map(sources.map(s => [s.type, s]))
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let pointerDownPos = {x: 0, y: 0}
    let enabled = true

    const handlePointerDown = (e: PointerEvent) => {
        if (!enabled) return
        renderer.domElement.focus()
        if (e.button === 0) pointerDownPos = {x: e.clientX, y: e.clientY}
    }

    const handlePointerUp = (e: PointerEvent) => {
        if (!enabled) return
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
    }

    const handleWheel = (e: WheelEvent) => {
        if (!enabled) return
        if (!terrainSources || terrainSources.length === 0) return
        const hasTerrainSelected = terrainSources.some(ts => ts.getSelectedId() !== undefined)
        if (!hasTerrainSelected) return
        e.preventDefault()

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const terrainMeshes = terrainSources.flatMap(s => s.getMeshes())
        if (terrainMeshes.length === 0) return
        const hits = raycaster.intersectObjects(terrainMeshes, false)
        if (hits.length === 0) return

        const hitMesh = hits[0].object as Mesh
        const hitPoint = hits[0].point
        for (const ts of terrainSources) {
            const entity = ts.getEntityList().find(e => e.mesh === hitMesh)
            if (entity) {
                const dir = e.deltaY > 0 ? -1 : 1
                ts.sculpt(entity.id, hitPoint.x, hitPoint.z, dir as 1 | -1)
                return
            }
        }
    }

    const handleContextMenu = (e: MouseEvent) => {
        if (!enabled) return
        e.preventDefault()
        const mode = getSpawnMode()
        const source = sourcesByType.get(mode)
        if (!source) return

        pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(pointer, camera)

        const allMeshes = sources.flatMap(s => s.getMeshes())
        const hits = allMeshes.length > 0 ? raycaster.intersectObjects(allMeshes, false) : []
        let spawnPos: Vector3

        if (hits.length > 0 && hits[0].distance <= SPAWN_DIST) {
            spawnPos = hits[0].point
        } else {
            spawnPos = new Vector3()
            raycaster.ray.at(SPAWN_DIST, spawnPos)
        }

        source.spawnAt(spawnPos.x, spawnPos.y, spawnPos.z)
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('wheel', handleWheel)
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)

    return {
        setEnabled: (v: boolean) => { enabled = v },
    }
}
