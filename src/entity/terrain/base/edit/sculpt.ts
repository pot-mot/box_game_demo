import {Raycaster, Vector2, Mesh, type Object3D, type PerspectiveCamera} from 'three'

/** 地形雕刻所需的地形源最小接口（便于测试注入，避免依赖完整 `TerrainContext`） */
export interface TerrainSculptSource {
    getSelectedId: () => number | undefined
    getMeshes: () => Mesh[]
    getEntityList: () => ReadonlyArray<{id: number; mesh: Object3D}>
    sculpt: (id: number, worldX: number, worldY: number, worldZ: number, direction: 1 | -1) => void
}

/** 地形雕刻控制器：勾选启用后，滚轮按命中地形高度格升降 */
export interface TerrainSculpt {
    setEnabled: (v: boolean) => void
    isEnabled: () => boolean
    dispose: () => void
}

/**
 * 地形雕刻（编辑模式）：仅在**主动启用且已选中地形**时拦截滚轮，按命中点升降一格。
 * 未启用时滚轮交还相机缩放。启用状态由 `setupTerrainSculptPanel` 的复选框控制。
 */
export const setupTerrainSculpt = (
    camera: PerspectiveCamera,
    domElement: HTMLElement,
    terrainSources: readonly TerrainSculptSource[],
): TerrainSculpt => {
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let enabled = false

    const handleWheel = (e: WheelEvent): void => {
        if (!enabled) return
        if (terrainSources.length === 0) return
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

        const hitObject = hits[0].object
        if (!(hitObject instanceof Mesh)) return
        const hitPoint = hits[0].point
        for (const ts of terrainSources) {
            const entity = ts.getEntityList().find(e => e.mesh === hitObject)
            if (entity) {
                const dir = e.deltaY > 0 ? -1 : 1
                ts.sculpt(entity.id, hitPoint.x, hitPoint.y, hitPoint.z, dir)
                return
            }
        }
    }

    domElement.addEventListener('wheel', handleWheel)

    return {
        setEnabled: (v: boolean) => { enabled = v },
        isEnabled: () => enabled,
        dispose: () => { domElement.removeEventListener('wheel', handleWheel) },
    }
}
