import {MeshStandardMaterial, CanvasTexture, type Texture} from 'three'
import {SURFACE_MATERIAL_DEFS} from './defs.ts'
import {SURFACE_MATERIAL_IDS, SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from './ids.ts'
import {buildSurfaceTexture, buildSurfaceGridTexture} from './textures.ts'

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

let _gridTextures: Map<SurfaceMaterialId, CanvasTexture> | undefined

/**
 * 箱子 / 碎片专用表面纹理单例（材质图案 + 每格网格线）。
 * 与建筑共用的 `buildSurfaceTexture` 分开缓存，避免把网格线带进建筑体素。
 */
export const getSurfaceGridTexture = (id: SurfaceMaterialId): CanvasTexture => {
    if (_gridTextures === undefined) _gridTextures = new Map()
    const cached = _gridTextures.get(id)
    if (cached !== undefined) return cached
    const tex = buildSurfaceGridTexture(id)
    _gridTextures.set(id, tex)
    return tex
}

/** 释放共享材质与纹理（仅测试 / 销毁渲染器时调用） */
export const disposeSurfaceMaterials = (): void => {
    if (_materials !== undefined) {
        for (const material of _materials) {
            const map = material.map as Texture | null
            map?.dispose()
            material.dispose()
        }
        _materials = undefined
    }
    if (_gridTextures !== undefined) {
        for (const tex of _gridTextures.values()) tex.dispose()
        _gridTextures = undefined
    }
}
