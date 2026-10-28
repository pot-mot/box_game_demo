import type {Group, Mesh, MeshStandardMaterial} from 'three'
import type {MeshBuilder} from '../../../appearance/mesh_builder.ts'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'

/**
 * 生物护甲低多边形锻造工具：统一创建主 / 点缀材质，并提供带锥度的护板、
 * 盒状构件与锐利尖刺。各体形只描述「部件形状与位置」，材质 / 生命周期由 builder 统一管理。
 */
export interface CreatureArmorKit {
    readonly builder: MeshBuilder
    readonly joint: Group
    readonly main: MeshStandardMaterial
    readonly accent: MeshStandardMaterial
    /** 锥台护板（axis = 本地 Y；taper = 顶端相对底端的宽度；d = 本地 Z 厚度） */
    readonly plate: (
        material: MeshStandardMaterial,
        w: number, h: number, d: number,
        x: number, y: number, z: number,
        rx?: number, ry?: number, rz?: number,
        taper?: number,
    ) => Mesh
    /** 方盒构件（护脊 / 束带 / 刃片） */
    readonly box: (
        material: MeshStandardMaterial,
        w: number, h: number, d: number,
        x: number, y: number, z: number,
        rx?: number, ry?: number, rz?: number,
    ) => Mesh
    /** 低分段尖刺 / 爪刃（axis = 本地 Y，尖朝 +Y） */
    readonly spike: (
        material: MeshStandardMaterial,
        r: number, h: number,
        x: number, y: number, z: number,
        rx?: number, ry?: number, rz?: number,
        segments?: number,
    ) => Mesh
}

export const createCreatureArmorKit = (
    builder: MeshBuilder,
    joint: Group,
    material: CharacterMaterialId,
    color: number,
    accentColor: number,
): CreatureArmorKit => {
    const main = builder.materialById(material, color)
    const accent = builder.materialById(material, accentColor)
    return {
        builder,
        joint,
        main,
        accent,
        plate: (mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, taper = 0.9) =>
            builder.add(builder.frustum(Math.max(0.01, w * taper), Math.max(0.01, w), h, d / Math.max(0.01, w)), mat, x, y, z, rx, ry, rz, joint),
        box: (mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
            builder.add(builder.box(w, h, d), mat, x, y, z, rx, ry, rz, joint),
        spike: (mat, r, h, x, y, z, rx = 0, ry = 0, rz = 0, segments = 4) =>
            builder.add(builder.cone(r, h, segments), mat, x, y, z, rx, ry, rz, joint),
    }
}
