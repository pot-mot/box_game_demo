import type {ArmorMeshConfig, LimbMeshConfig} from '../equipment/mesh_config.ts'
import type {EquipmentStats} from '../equipment/types.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import type {ArmorSlot, LimbSlot} from './slots.ts'

/**
 * 单件装备（领域数据：槽位 + 数值修正 + 程序化外观配方）。
 * 护甲与肢体组件共用此结构（仅槽位类型与外观配方类型不同），数值汇总口径完全一致。
 * `slot` 是体形自定义部位 id；人形的槽位常量见 `slots.ts`。
 */
export interface EquipPieceConfig<S extends string, M> extends EquipmentStats {
    /** 装备 id（目录键，存档持久化） */
    readonly id: string
    /** 中文名（面板 / 提示） */
    readonly name: string
    /** 名称本地化键（缺省回退 `name`） */
    readonly nameKey?: StringLocaleKey
    /** 部位 id（体形 `EquipSlotDef.bodyPart`） */
    readonly slot: S
    /** 允许装备该物品的体形 id（缺省 = 全部体形） */
    readonly allowedBodyFormIds?: readonly string[]
    /** 外观部件配方 */
    readonly mesh: M
}

/** 单件护甲（覆盖对应身体部位的外观） */
export type ArmorPieceConfig = EquipPieceConfig<string, ArmorMeshConfig>

/** 装备表：部位 → 护甲 id；缺省 = 空槽（存档 / 面板 / 战斗组件共用） */
export type ArmorLoadout = Readonly<Record<string, string>>

/** 已校验装备表：未知 id / 槽位不匹配的条目已被剔除 */
export type ResolvedArmorLoadout = Readonly<Partial<Record<ArmorSlot, ArmorPieceConfig>>>

/** 单件肢体组件（种族肢体：默认顶替对应人类肢体，颜色随阵营调色板重着色） */
export type LimbPieceConfig = EquipPieceConfig<string, LimbMeshConfig>

/** 肢体装备表：部位 → 肢体 id；缺省（空 / undefined / null）= 默认人类肢体 */
export type LimbLoadout = Readonly<Record<string, string>>

/** 已校验肢体装备表：未知 id / 槽位不匹配的条目已被剔除 */
export type ResolvedLimbLoadout = Readonly<Partial<Record<LimbSlot, LimbPieceConfig>>>
