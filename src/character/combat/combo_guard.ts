import type {CombatComponent} from './types.ts'
import type {ComboGuard, ComboGuardContext, SkillSlot} from './skill_types.ts'

/**
 * 连段守卫求值与解析 — 首段（起手）与链下一段的触发条件判定。
 *
 * 键组模型：input.skillIndex 语义为攻击键组号（0 = 轻击键、1 = 重击键）；
 * 起手槽通过 entryGroup 映射到键组（默认 = 槽自身索引，兼容既有武器槽 0/1 即键位）。
 * 候选按槽声明顺序求值，第一个通过守卫且冷却完毕的槽胜出 ——
 * 带守卫的条件变体应声明在同组兜底槽（无守卫）之前。
 */

/** 求值守卫：无守卫 = 无条件通过 */
export const evalComboGuard = (guard: ComboGuard | undefined, ctx: ComboGuardContext): boolean =>
    guard === undefined || guard(ctx)

/** 起手槽归属键组：entryGroup 默认 = 槽自身索引 */
const entryGroupOf = (slot: SkillSlot, index: number): number => slot.entryGroup ?? index

/**
 * 起手选择：键组 = reqKey 的 isChainEntry 槽按声明顺序取第一个冷却完毕且守卫通过的。
 * 兜底：请求槽非起手槽（如远程单槽技能）时按冷却 + 守卫直接释放。
 * 无候选 → -1。
 */
export const resolveEntrySkillIndex = (c: CombatComponent, reqKey: number, ctx: ComboGuardContext): number => {
    for (let i = 0; i < c.skills.length; i++) {
        const s = c.skills[i]
        if (!s.isChainEntry || entryGroupOf(s, i) !== reqKey) continue
        if (s.cooldownTimer > 0) continue
        if (evalComboGuard(s.triggerGuard, ctx)) return i
    }
    const req = c.skills[reqKey]
    if (req !== undefined && !req.isChainEntry && req.cooldownTimer <= 0 && evalComboGuard(req.triggerGuard, ctx)) {
        return reqKey
    }
    return -1
}

/** 链下一段：当前槽 comboChain 候选按声明顺序取第一个守卫通过的；无链 / 全部不通过 → -1 */
export const resolveChainNextIndex = (c: CombatComponent, ctx: ComboGuardContext): number => {
    const chain = c.skills[c.currentSkillIndex]?.comboChain
    if (chain === undefined) return -1
    for (const id of chain) {
        const idx = c.skills.findIndex(s => s.config.id === id)
        if (idx === -1) continue
        if (evalComboGuard(c.skills[idx].triggerGuard, ctx)) return idx
    }
    return -1
}

/** 当前链的键组（起手槽归属组；无起手槽时取起手索引自身） */
export const chainGroupOf = (c: CombatComponent): number => {
    const entry = c.skills[c.chainEntryIndex]
    return entry !== undefined ? entryGroupOf(entry, c.chainEntryIndex) : c.chainEntryIndex
}

/* ── 常用守卫（供武器预设组合使用） ── */

/** 长按：holdDuration >= 阈值（蓄力攻击，按键松开时由输入侧携带总按住时长触发判定） */
export const holdAtLeast = (seconds: number): ComboGuard => (ctx) => ctx.holdDuration >= seconds

/** 点按：holdDuration < 阈值 */
export const holdLessThan = (seconds: number): ComboGuard => (ctx) => ctx.holdDuration < seconds

/** 有移动方向输入（攻击 + 方向组合键） */
export const hasMoveInput: ComboGuard = (ctx) => Math.hypot(ctx.dx, ctx.dz) > 0.001

/** 无移动方向输入 */
export const noMoveInput: ComboGuard = (ctx) => Math.hypot(ctx.dx, ctx.dz) <= 0.001
