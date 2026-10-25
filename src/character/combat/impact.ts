/**
 * 冲击力 / 受击效果（统合枚举）：
 * - **冲击力**：攻击段（`AttackSegment.impact`）固有的强度等级，随伤害事件流经命中链路；
 * - **受击效果**：目标按「来袭冲击力 + 自身状态」承受的反应（轻无效果 / 中弱硬直 / 重强硬直 / 倒地）。
 *
 * 两者同源同枚举，语义由使用侧区分。与物理击退（`knockbackForce`）解耦：冲击力决定状态效果，击退决定位移。
 */
import type {StringLocaleKey} from '../../i18n/index.ts'

/** 冲击力等级（数值越大越强；也是盾格挡降级与倒地的判据） */
export const IMPACT_LEVELS = ['light', 'medium', 'heavy', 'knockdown'] as const
export type ImpactLevel = typeof IMPACT_LEVELS[number]

/** 冲击力本地化名键（面板 / HUD / 调试标签用） */
export const IMPACT_LABELS: Record<ImpactLevel, StringLocaleKey> = {
    light: 'impact.light',
    medium: 'impact.medium',
    heavy: 'impact.heavy',
    knockdown: 'impact.knockdown',
}

/** 冲击力强度序号（0 = light … 3 = knockdown） */
export const impactRank = (impact: ImpactLevel): number => IMPACT_LEVELS.indexOf(impact)

/** 降低一级冲击力（`light` 为下限不变），供盾牌格挡削弱来袭冲击使用 */
export const downgradeImpact = (impact: ImpactLevel): ImpactLevel =>
    IMPACT_LEVELS[Math.max(0, impactRank(impact) - 1)]

/** 弱硬直（medium）可触发受击的状态集合：非承诺动作状态才被弱冲击打断 */
export const WEAK_FLINCH_RECEPTIVE_STATES = ['idle', 'walking', 'sprinting', 'jumping', 'falling', 'flying', 'interacting'] as const

/** 该状态是否接受弱硬直（medium 冲击）——攻击 / 翻滚等承诺动作状态不受弱冲击打断 */
export const isWeakFlinchReceptive = (state: string): boolean =>
    WEAK_FLINCH_RECEPTIVE_STATES.some(s => s === state)
