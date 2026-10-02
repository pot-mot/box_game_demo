/**
 * 蓄力调参（武器模板默认 / 单武器覆盖 / 面板字符覆写 共用）。
 *
 * 蓄力值 `charge ∈ [0,1]`（`combat.attackCharge`）与伤害倍率成**一次函数**：
 * charge = 0 → 100%（无加成）；charge = 1 → `maxChargeMultiplier`%（如 300 = 攻击力 ×3）。
 * 满蓄力所需按住时长为 `maxChargeTime` 秒。
 */
export interface ChargeTuning {
    /** 满蓄力伤害倍率（%，100 = 无加成；300 = 满蓄力攻击力 ×3） */
    readonly maxChargeMultiplier: number
    /** 满蓄力所需按住时长（秒） */
    readonly maxChargeTime: number
}

/** 近战重击蓄力默认（可被武器模板 / 单武器 / 角色面板逐层覆盖）：满蓄力 1s → 200%（×2） */
export const DEFAULT_CHARGE_TUNING: ChargeTuning = {maxChargeMultiplier: 200, maxChargeTime: 1}

/** 蓄力值 → 伤害倍率（相对未蓄力）：`1 + (maxChargeMultiplier/100 − 1) × charge` */
export const chargeDamageScale = (tuning: ChargeTuning, charge: number): number =>
    1 + (tuning.maxChargeMultiplier / 100 - 1) * Math.max(0, Math.min(1, charge))

/** 蓄力值 → 伤害加成（段字段 `chargeDamageBonus` = 倍率 − 1）：满蓄力 `maxChargeMultiplier/100 − 1` */
export const chargeDamageBonusOf = (tuning: ChargeTuning): number => tuning.maxChargeMultiplier / 100 - 1
