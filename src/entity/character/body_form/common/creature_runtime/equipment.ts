import type {Group, Object3D} from 'three'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'
import type {EquipmentState} from '../../../../../character/equipment/types.ts'
import type {EquipmentAppearanceBuilder, EquipmentAppearanceHandle} from '../types.ts'
import {findArmorPreset} from '../../../../../character/armor/catalog.ts'
import type {MeshBuilder} from '../../../appearance/mesh_builder.ts'
import {darkenColor} from '../../../../../render/constants.ts'

/** 单个装甲槽位的锻造上下文（每个挂载关节调用一次） */
export interface CreatureArmorBuildContext {
    readonly builder: MeshBuilder
    /** 当前挂载关节（护甲网格直接挂到该关节） */
    readonly joint: Group
    readonly jointId: string
    readonly material: CharacterMaterialId
    readonly color: number
    readonly accentColor: number
    /** 护甲件 id（用于区分同槽位的不同套装造型） */
    readonly pieceId: string
}

export type CreatureArmorSlotBuild = (ctx: CreatureArmorBuildContext) => void

export interface CreatureEquipmentStyle {
    /** 护甲默认材质（配方的 material 优先） */
    readonly armorMaterial: CharacterMaterialId
    /** 各护甲槽位的低多边形锻造器（缺省 = 该槽位无外观） */
    readonly armor: Readonly<Record<string, CreatureArmorSlotBuild>>
}

/**
 * 生物护甲外观构建器：每个槽位由体形自己的低多边形锻造器生成尖锐 / 分层的护甲造型。
 *
 * 肢体不走此构建器：非人形体形的肢体是**逐槽位材质替换**（直接替换该槽位原模型部件材质），
 * 不叠加额外网格。旧版按槽位叠加的肢体块已迁移为独立护甲套装。
 */
export const createCreatureEquipmentAppearance = (
    style: CreatureEquipmentStyle,
): EquipmentAppearanceBuilder => (state: EquipmentState, ctx): EquipmentAppearanceHandle => {
    const created: Object3D[] = []
    for (const [bodyPart, pieceId] of Object.entries(state.armor)) {
        const piece = findArmorPreset(pieceId)
        if (piece === undefined || piece.slot !== bodyPart) continue
        const build = style.armor[bodyPart]
        if (build === undefined) continue
        const slot = ctx.equipSlots.find(candidate => candidate.kind === 'armor' && candidate.bodyPart === bodyPart)
        if (slot === undefined) continue
        const mounts = piece.mounts ?? slot.mountJointIds.map(jointId => ({jointId, mesh: piece.mesh}))
        for (const mount of mounts) {
            const joint = ctx.groups.get(mount.jointId)
            if (joint === undefined) continue
            const meshInfo = mount.mesh
            const before = new Set(joint.children)
            build({
                builder: ctx.builder,
                joint,
                jointId: mount.jointId,
                material: meshInfo.material ?? style.armorMaterial,
                color: meshInfo.color,
                accentColor: meshInfo.accentColor ?? darkenColor(meshInfo.color, 0.65),
                pieceId: piece.id,
            })
            for (const child of joint.children) {
                if (!before.has(child)) created.push(child)
            }
        }
    }
    return {
        dispose: (): void => {
            for (const mesh of created) mesh.removeFromParent()
            created.length = 0
            ctx.builder.dispose()
        },
    }
}
