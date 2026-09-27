import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {ArmorMeshConfig} from '../../entity/character/appearance/armor_mesh.ts'
import type {ArmorSlot} from './slots.ts'

/** 单件护甲（领域数据：槽位 + 数值修正 + 程序化外观配方） */
export interface ArmorPieceConfig {
    /** 护甲 id（目录键，存档持久化） */
    readonly id: string
    /** 中文名（面板 / 提示） */
    readonly name: string
    readonly slot: ArmorSlot
    /** 逐攻击类别防御（固定减伤） */
    readonly defense: DamageTypeProfile
    /** 逐攻击类别攻击加成：仅在与武器攻击类别匹配时计入伤害（无加成填 0/0） */
    readonly attack: DamageTypeProfile
    /** 移速乘数（1 = 无修正；<1 减速、>1 加速；多件装备相乘） */
    readonly moveSpeedMultiplier: number
    /** 覆盖对应身体部位的外观部件配方 */
    readonly mesh: ArmorMeshConfig
}

/** 装备表：槽位 → 护甲 id；缺省 = 空槽（存档 / 面板 / 战斗组件共用） */
export type ArmorLoadout = Readonly<Partial<Record<ArmorSlot, string>>>

/** 已校验装备表：未知 id / 槽位不匹配的条目已被剔除 */
export type ResolvedArmorLoadout = Readonly<Partial<Record<ArmorSlot, ArmorPieceConfig>>>
