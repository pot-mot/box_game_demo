import type {SurfaceMaterialId} from './ids.ts'

/** 程序纹理图案种类 */
type SurfacePatternKind = 'rock' | 'soil' | 'brick' | 'wood' | 'rust' | 'tile' | 'cloth'

/** 基础表面材质定义 */
export interface SurfaceMaterialDef {
    /** 底色（0xRRGGBB） */
    readonly baseColor: number
    /** 粗糙度（0..1，写入 ORM 图集 G 通道） */
    readonly roughness: number
    /** 金属度（0..1，写入 ORM 图集 B 通道） */
    readonly metalness: number
    /** 程序纹理图案 */
    readonly pattern: SurfacePatternKind
}

/** 基础表面材质定义表 */
const SURFACE_MATERIAL_DEFS: Record<SurfaceMaterialId, SurfaceMaterialDef> = {
    rock: {baseColor: 0x7d7b76, roughness: 0.95, metalness: 0.0, pattern: 'rock'},
    soil: {baseColor: 0x6b4f34, roughness: 1.0, metalness: 0.0, pattern: 'soil'},
    brick: {baseColor: 0x9c4a34, roughness: 0.9, metalness: 0.0, pattern: 'brick'},
    wood: {baseColor: 0x8a5a2b, roughness: 0.8, metalness: 0.0, pattern: 'wood'},
    rusty_iron: {baseColor: 0x7a4a33, roughness: 0.6, metalness: 0.7, pattern: 'rust'},
    tile: {baseColor: 0xb9bec4, roughness: 0.35, metalness: 0.05, pattern: 'tile'},
    cloth: {baseColor: 0x4f7a4a, roughness: 1.0, metalness: 0.0, pattern: 'cloth'},
}

export {SURFACE_MATERIAL_DEFS}
