/**
 * 武器模组共享常量（近战 / 远程通用；武器类数值集中于此，禁止散落函数体）。
 * 盾牌格挡配置 `ShieldBlockConfig` 及其三档预设亦在此集中定义（见 `docs/design/shield_block.md` §3）。
 */

/** 盾牌遮挡体几何（角色局部坐标；+Z = 朝向，Y 向上）：宽 × 高 × 厚 + 相对角色原点（脚底）的偏移 */
export interface ShieldCoverBox {
    readonly width: number
    readonly height: number
    readonly depth: number
    readonly offsetY: number
    readonly offsetZ: number
}

/**
 * 盾牌格挡能力（近战武器类可选字段）：
 * 短按攻击键出招（盾击）、长按超过 `holdThreshold` 举盾格挡；对遮挡范围内的近战 / 子弹部分减免，
 * 并消耗 `guard` 格挡槽；归零触发破防（`guard_broken` 状态）。爆炸 / AOE 无视盾。
 */
export interface ShieldBlockConfig {
    /** 格挡槽上限 */
    readonly guardMax: number
    /** 未受击时每秒回复 */
    readonly guardRegenPerSec: number
    /** 破防硬直时长（秒） */
    readonly guardBreakDuration: number
    /** 被挡伤害对 HP 的系数 */
    readonly blockDamageMultiplier: number
    /** 被挡击退系数 */
    readonly blockKnockbackMultiplier: number
    /** 被挡削韧系数（作用于来袭 `poiseDamage`） */
    readonly poiseMultiplier: number
    /** 短按 / 长按分界（秒） */
    readonly holdThreshold: number
    /** 格挡期间水平移速系数 */
    readonly moveSpeedMultiplier: number
    /** 格挡半角（弧度，朝向两侧的遮挡张角） */
    readonly blockHalfAngle: number
    /** 遮挡体几何（同时作为盾碰撞体近似） */
    readonly cover: ShieldCoverBox
}

/** 小盾（圆盾）：轻便、恢复快、格挡面窄 */
export const SHIELD_BLOCK_SMALL: ShieldBlockConfig = {
    guardMax: 40, guardRegenPerSec: 20, guardBreakDuration: 0.6,
    blockDamageMultiplier: 0.25, blockKnockbackMultiplier: 0.3, poiseMultiplier: 0.3,
    holdThreshold: 0.25, moveSpeedMultiplier: 0.95, blockHalfAngle: (70 * Math.PI) / 180,
    cover: {width: 0.4, height: 0.5, depth: 0.10, offsetY: 0.9, offsetZ: 0.32},
}

/** 中盾（鸢盾）：均衡 */
export const SHIELD_BLOCK_MEDIUM: ShieldBlockConfig = {
    guardMax: 70, guardRegenPerSec: 18, guardBreakDuration: 0.9,
    blockDamageMultiplier: 0.20, blockKnockbackMultiplier: 0.25, poiseMultiplier: 0.25,
    holdThreshold: 0.25, moveSpeedMultiplier: 0.80, blockHalfAngle: (60 * Math.PI) / 180,
    cover: {width: 0.6, height: 0.9, depth: 0.12, offsetY: 1.0, offsetZ: 0.34},
}

/** 大盾（塔盾）：格挡面最广、上限最高，但笨重 */
export const SHIELD_BLOCK_LARGE: ShieldBlockConfig = {
    guardMax: 110, guardRegenPerSec: 14, guardBreakDuration: 1.2,
    blockDamageMultiplier: 0.15, blockKnockbackMultiplier: 0.2, poiseMultiplier: 0.2,
    holdThreshold: 0.25, moveSpeedMultiplier: 0.50, blockHalfAngle: (50 * Math.PI) / 180,
    cover: {width: 0.9, height: 1.4, depth: 0.15, offsetY: 1.1, offsetZ: 0.36},
}
