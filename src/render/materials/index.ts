import {MeshStandardMaterial, type Texture} from 'three'
import {SURFACE_MATERIAL_DEFS} from './defs.ts'
import {SURFACE_MATERIAL_IDS, SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from './ids.ts'
import {buildSurfaceTexture} from './textures.ts'

export {SURFACE_MATERIAL_IDS, SURFACE_MATERIAL_INDEX, MATERIAL_INDEX_TO_ID} from './ids.ts'
export type {SurfaceMaterialId} from './ids.ts'
export {SURFACE_MATERIAL_DEFS} from './defs.ts'
export type {SurfaceMaterialDef} from './defs.ts'

let _materials: MeshStandardMaterial[] | undefined

/**
 * 基础表面材质单例列表（下标 = 体素索引 1..7 减 1，与 `SURFACE_MATERIAL_IDS` 顺序一致）。
 * 每种材质一张可平铺纹理；贪心合并后的 chunk 网格按材质分组（`geometry.addGroup`），
 * 共享这些材质单例。
 */
export const getSurfaceMaterials = (): MeshStandardMaterial[] => {
    if (_materials !== undefined) return _materials
    _materials = SURFACE_MATERIAL_IDS.map(id => {
        const def = SURFACE_MATERIAL_DEFS[id]
        return new MeshStandardMaterial({
            map: buildSurfaceTexture(id),
            roughness: def.roughness,
            metalness: def.metalness,
        })
    })
    return _materials
}

/** 按材质 id 取共享材质单例 */
export const getSurfaceMaterial = (id: SurfaceMaterialId): MeshStandardMaterial =>
    getSurfaceMaterials()[SURFACE_MATERIAL_INDEX[id] - 1]

/** 释放共享材质与纹理（仅测试 / 销毁渲染器时调用） */
export const disposeSurfaceMaterials = (): void => {
    if (_materials === undefined) return
    for (const material of _materials) {
        const map = material.map as Texture | null
        map?.dispose()
        material.dispose()
    }
    _materials = undefined
}
