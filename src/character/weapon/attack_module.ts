import type {StringLocaleKey} from '../../i18n/index.ts'
import type {HoldMode} from './hold_mode.ts'
import type {WeaponAttacks} from './attack_chain.ts'
import type {WeaponConfig} from './catalog.ts'

/**
 * 攻击模组（Attack Module）—— 角色可切换的“出招方案”。
 *
 * 与历史 `HoldMode` 的区别：
 * - `HoldMode` 只描述人形如何握持武器（单持 / 双手共持 / 双持），仍保留为人形语义；
 * - `AttackModuleId` 是跨体形的通用选择单位：人形持械仍用三档持握名作为模组 id，
 *   人形空手用 `one_handed` / `dual_wield`，生物则可用 `mouth` / `claw` / `breath` / `hoof` 等。
 *
 * 模组由武器声明，但**可用性由角色全部武器槽的装备情况决定**：
 * 槽位里没有对应武器、或跨槽要求未满足时该模组不可用。
 */
export type AttackModuleId = string

/** 攻击模组定义（武器类/模型共享；id 在同一体形的全部武器槽内须唯一） */
export interface AttackModuleDef {
    readonly id: AttackModuleId
    /** 面板 / 展示标签本地化键 */
    readonly nameKey: StringLocaleKey
    /** 人形握持语义（缺省 = 该模组不驱动持握/副手/盾牌行为） */
    readonly holdMode?: HoldMode
    /**
     * 该模组要求的额外武器槽（如龙吐息要求 `breath` 槽）。
     * 缺省 = 不额外要求；主槽位恒为声明该模组的武器所在槽。
     */
    readonly requiredSlots?: readonly string[]
    /**
     * 重击链来源槽位（缺省 = 主槽位）。
     * 用于“轻爪重吐息”这类跨槽组合：轻/空链取主槽武器，重链取此槽武器。
     */
    readonly heavySlot?: string
}

/** 解析后的攻击模组运行时：模组定义 + 主槽武器 + 当前攻击链 + 逐段实际武器映射 */
export interface AttackModuleRuntime {
    readonly def: AttackModuleDef
    /** 主武器槽 bodyPart（该模组的轻/空链来源） */
    readonly primarySlot: string
    /** 主槽武器（UI / 数值 / 检测箱来源） */
    readonly primaryWeapon: WeaponConfig
    /** 当前模组攻击链（含跨槽重击组合） */
    readonly attacks: WeaponAttacks
    /** 段 id → 实际攻击武器（龙吐息重击等跨槽段） */
    readonly attackWeapons: ReadonlyMap<string, WeaponConfig>
}
