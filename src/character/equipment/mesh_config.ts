import type {CharacterMaterialId} from '../../render/character_materials.ts'

/**
 * 装备外观配方（纯数据，不依赖 entity / render 生成器）。
 * 具体网格构建器由拥有该体形的 `appearance/` 分包实现；领域层只持有配方类型与数值契约。
 */

/** 护甲外观形状 id（常量 + 索引类型推导） */
export const ARMOR_MESH_IDS = ['cap', 'helmet', 'hood', 'vest', 'plate', 'robe', 'bracer', 'greaves', 'legwrap', 'boots'] as const
export type ArmorMeshId = typeof ARMOR_MESH_IDS[number]

/** 肢体种族（骷髅 / 兽人 / 精灵） */
export const LIMB_RACES = ['skeleton', 'orc', 'elf'] as const
export type LimbRace = typeof LIMB_RACES[number]

/** 身体部位名（语义标识，与骨架关节 id 解耦）：护甲通过 `hideBodyParts` 声明要顶替的部位 */
export const ARMOR_BODY_PARTS = [
    'head', 'torso',
    'rightUpperArm', 'rightForearm', 'rightHand',
    'leftUpperArm', 'leftForearm', 'leftHand',
    'rightThigh', 'rightShin', 'leftThigh', 'leftShin',
] as const
export type ArmorBodyPart = typeof ARMOR_BODY_PARTS[number]

/** 护甲外观配方 */
export interface ArmorMeshConfig {
    readonly id: ArmorMeshId
    readonly color: number
    readonly accentColor?: number
    /** 材质库 id（缺省按形状推导：金属甲 / 布料 / 皮革） */
    readonly material?: CharacterMaterialId
    /** 装备后隐藏的身体部位（护甲顶替该部位模型而非叠加）；缺省 = 不隐藏 */
    readonly hideBodyParts?: readonly ArmorBodyPart[]
}

/**
 * 肢体外观配方（种族 + 种族基色；阵营色由创建时传入的调色板注入）。
 * 肢体默认顶替对应人类肢体（`replace` 恒开启），无需 `hideBodyParts` 声明。
 */
export interface LimbMeshConfig {
    readonly race: LimbRace
    /** 种族基色（骨骼 / 皮肤 / 躯体主色） */
    readonly color: number
    /** 种族点缀色（缺省回退主色暗化） */
    readonly accentColor?: number
}
