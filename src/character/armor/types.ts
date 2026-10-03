import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {ArmorMeshConfig, LimbMeshConfig} from '../../entity/character/appearance/armor_mesh.ts'
import type {ArmorSlot, LimbSlot} from './slots.ts'

/**
 * 单件装备（领域数据：槽位 + 数值修正 + 程序化外观配方）。
 * 护甲与肢体组件共用此结构（仅槽位类型与外观配方类型不同），数值汇总口径完全一致。
 */
export interface EquipPieceConfig<S extends string, M> {
    /** 装备 id（目录键，存档持久化） */
    readonly id: string
    /** 中文名（面板 / 提示） */
    readonly name: string
    readonly slot: S
    /** 逐攻击类别防御（固定减伤） */
    readonly defense: DamageTypeProfile
    /** 逐攻击类别攻击加成：仅在与武器攻击类别匹配时计入伤害（无加成填 0/0） */
    readonly attack: DamageTypeProfile
    /** 移速乘数（1 = 无修正；<1 减速、>1 加速；多件装备相乘） */
    readonly moveSpeedMultiplier: number
    /** 外观部件配方 */
    readonly mesh: M
}

/** 单件护甲（覆盖对应身体部位的外观） */
export type ArmorPieceConfig = EquipPieceConfig<ArmorSlot, ArmorMeshConfig>

/** 装备表：槽位 → 护甲 id；缺省 = 空槽（存档 / 面板 / 战斗组件共用） */
export type ArmorLoadout = Readonly<Partial<Record<ArmorSlot, string>>>

/** 已校验装备表：未知 id / 槽位不匹配的条目已被剔除 */
export type ResolvedArmorLoadout = Readonly<Partial<Record<ArmorSlot, ArmorPieceConfig>>>

/** 单件肢体组件（种族肢体：默认顶替对应人类肢体，颜色随阵营调色板重着色） */
export type LimbPieceConfig = EquipPieceConfig<LimbSlot, LimbMeshConfig>

/** 肢体装备表：槽位 → 肢体 id；缺省（空 / undefined / null）= 默认人类肢体 */
export type LimbLoadout = Readonly<Partial<Record<LimbSlot, string>>>

/** 已校验肢体装备表：未知 id / 槽位不匹配的条目已被剔除 */
export type ResolvedLimbLoadout = Readonly<Partial<Record<LimbSlot, LimbPieceConfig>>>
