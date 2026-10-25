import type {Mesh} from 'three'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'
import type {EquipmentState} from '../../../../../character/equipment/types.ts'
import type {EquipmentAppearanceBuilder, EquipmentAppearanceHandle} from '../types.ts'
import {findArmorPreset, findLimbPreset} from '../../../../../character/armor/catalog.ts'

/** 单部位装备外观尺寸（米，体形局部空间）：w/h/d 为包围尺寸，offset 为相对关节偏移 */
export interface CreatureEquipPartSize {
    readonly w: number
    readonly h: number
    readonly d: number
    readonly offset?: readonly [number, number, number]
}

export interface CreatureEquipmentStyle {
    /** 护甲 / 肢体的默认材质（配方的 material 优先） */
    readonly armorMaterial: CharacterMaterialId
    readonly limbMaterial: CharacterMaterialId
    /** 护甲各部位尺寸（缺省 = 不渲染该部位） */
    readonly armor: Readonly<Record<string, CreatureEquipPartSize>>
    /** 肢体各部位尺寸（缺省 = 不渲染该部位） */
    readonly limb: Readonly<Record<string, CreatureEquipPartSize>>
}

/** 逐件颜色：臂甲配方带 color；无 color 时按槽位主色兜底 */
const colorOf = (meshInfo: unknown, fallback: number): number =>
    typeof meshInfo === 'object' && meshInfo !== null && 'color' in meshInfo
        ? Number((meshInfo as {color?: unknown}).color ?? fallback)
        : fallback

/**
 * 生物装备外观构建器（体形提供尺寸/材质风格，公共装配逻辑复用）：
 * 在槽位声明的每个挂载关节上生成真实低多面体护甲/肢体块，避免退化为统一占位方块。
 */
export const createCreatureEquipmentAppearance = (
    style: CreatureEquipmentStyle,
): EquipmentAppearanceBuilder => (state: EquipmentState, ctx): EquipmentAppearanceHandle => {
    const meshes: Mesh[] = []
    const addPiece = (kind: 'armor' | 'limb', bodyPart: string, pieceId: string): void => {
        const piece = kind === 'armor' ? findArmorPreset(pieceId) : findLimbPreset(pieceId)
        if (piece === undefined || piece.slot !== bodyPart) return
        const size = (kind === 'armor' ? style.armor : style.limb)[bodyPart]
        if (size === undefined) return
        const slot = ctx.equipSlots.find(candidate => candidate.kind === kind && candidate.bodyPart === bodyPart)
        if (slot === undefined) return
        const fallbackMaterial = kind === 'armor' ? style.armorMaterial : style.limbMaterial
        const baseW = Math.max(0.02, size.w)
        const baseH = Math.max(0.02, size.h)
        const baseD = Math.max(0.02, size.d)
        const mounts: readonly {jointId: string; mesh: typeof piece.mesh; offset?: {x: number; y: number; z: number}; rotation?: {x: number; y: number; z: number}; scale?: {x: number; y: number; z: number}}[] = piece.mounts ?? slot.mountJointIds.map(jointId => ({jointId, mesh: piece.mesh}))
        for (const mount of mounts) {
            const joint = ctx.groups.get(mount.jointId)
            if (joint === undefined) continue
            const meshInfo = mount.mesh
            const materialId = kind === 'armor' && 'material' in meshInfo && meshInfo.material !== undefined
                ? meshInfo.material
                : fallbackMaterial
            const color = colorOf(meshInfo, kind === 'armor' ? 0x8a8f98 : 0x6f9a4a)
            const material = ctx.builder.materialById(materialId, color)
            const offset = mount.offset ?? {x: size.offset?.[0] ?? 0, y: size.offset?.[1] ?? baseH / 2, z: size.offset?.[2] ?? 0}
            const rotation = mount.rotation ?? {x: 0, y: 0, z: 0}
            const scale = mount.scale ?? {x: 1, y: 1, z: 1}
            const mesh = ctx.builder.add(
                ctx.builder.frustum(baseW * scale.x, baseW * 0.94 * scale.x, baseH * scale.y, baseD / baseW),
                material,
                offset.x,
                offset.y,
                offset.z,
                rotation.x,
                rotation.y,
                rotation.z,
                joint,
            )
            mesh.userData.jointId = mount.jointId
            meshes.push(mesh)
        }
    }
    for (const [bodyPart, id] of Object.entries(state.armor)) addPiece('armor', bodyPart, id)
    for (const [bodyPart, id] of Object.entries(state.limb)) addPiece('limb', bodyPart, id)
    return {
        dispose: (): void => {
            for (const mesh of meshes) mesh.removeFromParent()
            meshes.length = 0
            ctx.builder.dispose()
        },
    }
}
