/**
 * 基础表面材质标识 —— 用于装饰建筑 / 实体表面的共享材质库。
 * 每种材质在纹理图集中占一个格子，体素 block 以「材质索引」引用（见 MATERIAL_INDEX_TO_ID）。
 */

/** 基础表面材质列表（顺序即图集槽位与体素索引顺序） */
const SURFACE_MATERIAL_IDS = ['rock', 'soil', 'brick', 'wood', 'rusty_iron', 'tile', 'cloth'] as const
type SurfaceMaterialId = typeof SURFACE_MATERIAL_IDS[number]

/** 材质 id → 体素存储索引（0 保留为空，故从 1 起） */
const SURFACE_MATERIAL_INDEX: Record<SurfaceMaterialId, number> = {
    rock: 1,
    soil: 2,
    brick: 3,
    wood: 4,
    rusty_iron: 5,
    tile: 6,
    cloth: 7,
}

/** 体素存储索引 → 材质 id（索引 0 为空） */
const MATERIAL_INDEX_TO_ID: ReadonlyArray<SurfaceMaterialId | undefined> = [
    undefined,
    ...SURFACE_MATERIAL_IDS,
]

export {SURFACE_MATERIAL_IDS, SURFACE_MATERIAL_INDEX, MATERIAL_INDEX_TO_ID}
export type {SurfaceMaterialId}
