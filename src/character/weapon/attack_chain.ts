import type {AttackPhase} from '../combat/attack_phases.ts'

/**
 * 攻击链领域模型（武器模组拥有）：
 * - 攻击段（AttackSegment）= 武器的一次可播放动作（时长/阶段/倾斜角/伤害倍率/动画 id）；
 * - 攻击链（WeaponAttackChain）= 一个攻击键的起手候选 + 主干段播放顺序；
 * - 连段推进 = **段自身声明的 next 转换函数**（按声明顺序求值，第一个守卫通过者胜出），
 *   状态机只负责调度与消费，不再用「槽位下标 / comboChain 字符串索引」表达连段。
 *
 * 依赖方向：weapon/ → combat/attack_phases.ts（阶段与动画参数模型）。武器模组不依赖角色实体与状态机。
 */

/** 攻击键组（输入侧语义，与槽位下标无关） */
export const ATTACK_KEYS = ['light', 'heavy'] as const
export type AttackKey = typeof ATTACK_KEYS[number]

/** 攻击键中文名（HUD/面板/展示标签用） */
export const ATTACK_KEY_LABELS: Record<AttackKey, string> = {
    light: '轻击',
    heavy: '重击',
}

/**
 * 段转换求值上下文（状态机每帧构造）：
 * 输入侧信息 + 段冷却查询 —— 守卫只依赖它，不直接触碰实体/物理。
 */
export interface AttackTransitionContext {
    /** 移动输入方向（方向组合键变体用） */
    readonly dx: number
    readonly dz: number
    /** 攻击键按住时长（秒，松开触发蓄力段时携带总时长） */
    readonly holdDuration: number
    /** 本帧按下的攻击键（undefined = 无攻击输入） */
    readonly attackKey: AttackKey | undefined
    /** 查询某段剩余冷却（秒，<= 0 = 就绪） */
    readonly cooldownRemaining: (segmentId: string) => number
}

/** 段转换守卫（武器模组用下方原语组合声明条件变体） */
export type AttackTransitionGuard = (ctx: AttackTransitionContext) => boolean

/** 段转换：to = 目标段 id；按声明顺序求值，第一个守卫通过者胜出（guard 缺省 = 无条件） */
export interface AttackTransition {
    readonly to: string
    readonly guard?: AttackTransitionGuard
}

/** 攻击段（武器模组拥有的一次可播放动作；id 同时是动画键与展示/编辑器清单键） */
export interface AttackSegment {
    /** 段 id（武器内唯一，形如 `{weaponId}_{key}_{step}`） */
    readonly id: string
    /** 所属攻击键 */
    readonly key: AttackKey
    /** 链内序号（1-based） */
    readonly step: number
    /** 动作时长（秒，不含恢复段） */
    readonly duration: number
    /** 恢复时长（秒） */
    readonly recovery: number
    /** 阶段序列（strike / draw / aim / release …；recovery 阶段时长取本段 recovery） */
    readonly phases: readonly AttackPhase[]
    /** 段固有挥砍倾斜角（rad，0 = 竖劈，±π/2 = 横斩） */
    readonly swingTilt?: number
    /** 伤害倍率（相对武器基础伤害） */
    readonly damageMultiplier: number
    /** 冷却（秒，0 = 无冷却；非 0 时从段触发时刻开始计时，只挡起手） */
    readonly cooldown: number
    /** 段播完（含恢复段）后的下一状态候选；空数组 = 链终止 */
    readonly next: readonly AttackTransition[]
    /** 显示名覆写（条件变体段用，如「蓄力重劈」）；缺省按 轻击/重击 + 序号 推导 */
    readonly label?: string
}

/** 段是否双手持握（读取首阶段动画参数；无阶段 = 单手）——生产与编辑器共用的唯一判定 */
export const segmentTwoHanded = (segment: AttackSegment | undefined): boolean =>
    segment?.phases[0]?.animConfig.twoHanded ?? false

/** 起手候选：按声明顺序求值（守卫变体在前、兜底在后） */
export interface AttackEntry {
    readonly segmentId: string
    readonly guard?: AttackTransitionGuard
}

/** 单个攻击键的链 */
export interface WeaponAttackChain {
    readonly key: AttackKey
    /** 起手候选（声明顺序 = 优先级；守卫变体在前、兜底在后） */
    readonly entries: readonly AttackEntry[]
    /** 主干段播放顺序（HUD/清单/展示按此枚举；仅作为条件起手变体的段不入列） */
    readonly steps: readonly string[]
}

/** 全套攻击链（武器模组固有数据） */
export interface WeaponAttacks {
    readonly chains: Readonly<Record<AttackKey, WeaponAttackChain>>
    /** 段定义索引（id → 段） */
    readonly segments: Readonly<Record<string, AttackSegment>>
}

/* ── 守卫原语（武器模组组合使用） ── */

/** 无条件通过（兜底转换的显式写法） */
export const always: AttackTransitionGuard = () => true

/** 按下指定攻击键 */
export const pressedKey = (key: AttackKey): AttackTransitionGuard => (ctx) => ctx.attackKey === key

/** 按下非指定攻击键（切链用） */
export const pressedOtherKey = (key: AttackKey): AttackTransitionGuard =>
    (ctx) => ctx.attackKey !== undefined && ctx.attackKey !== key

/** 长按：按住时长 >= 阈值（蓄力段） */
export const holdAtLeast = (seconds: number): AttackTransitionGuard => (ctx) => ctx.holdDuration >= seconds

/** 点按：按住时长 < 阈值 */
export const holdLessThan = (seconds: number): AttackTransitionGuard => (ctx) => ctx.holdDuration < seconds

/** 有移动方向输入（攻击 + 方向组合键变体） */
export const hasMoveInput: AttackTransitionGuard = (ctx) => Math.hypot(ctx.dx, ctx.dz) > 0.001

/** 无移动方向输入 */
export const noMoveInput: AttackTransitionGuard = (ctx) => Math.hypot(ctx.dx, ctx.dz) <= 0.001

/** 目标段冷却已就绪（跨链切段/重新起链） */
export const cooldownReady = (segmentId: string): AttackTransitionGuard =>
    (ctx) => ctx.cooldownRemaining(segmentId) <= 0

/** 组合：全部通过 */
export const allOf = (...guards: readonly AttackTransitionGuard[]): AttackTransitionGuard =>
    (ctx) => guards.every(guard => guard(ctx))

/** 组合：任一通过 */
export const anyOf = (...guards: readonly AttackTransitionGuard[]): AttackTransitionGuard =>
    (ctx) => guards.some(guard => guard(ctx))

/** 取反 */
export const not = (guard: AttackTransitionGuard): AttackTransitionGuard => (ctx) => !guard(ctx)

/* ── 查询与解析 ── */

/** 段定义查询 */
export const findSegment = (attacks: WeaponAttacks, segmentId: string): AttackSegment | undefined =>
    attacks.segments[segmentId]

/** 攻击键的链 */
export const chainOf = (attacks: WeaponAttacks, key: AttackKey): WeaponAttackChain =>
    attacks.chains[key]

const evalGuard = (guard: AttackTransitionGuard | undefined, ctx: AttackTransitionContext): boolean =>
    guard === undefined || guard(ctx)

/**
 * 起手解析：该攻击键的起手候选按声明顺序取第一个**守卫通过且冷却完毕**的段。
 * 无候选 → undefined（idle/walking 的攻击转换 guard 与段末切链都用它判定）。
 */
export const resolveEntrySegment = (
    attacks: WeaponAttacks,
    key: AttackKey,
    ctx: AttackTransitionContext,
    currentSegmentId?: string,
): AttackSegment | undefined => {
    for (const entry of chainOf(attacks, key).entries) {
        const segment = findSegment(attacks, entry.segmentId)
        if (segment === undefined) continue
        /* 不切到自身（攻击中重复按同键不应重启本段） */
        if (currentSegmentId !== undefined && segment.id === currentSegmentId) continue
        if (ctx.cooldownRemaining(segment.id) > 0) continue
        if (!evalGuard(entry.guard, ctx)) continue
        return segment
    }
    return undefined
}

/** 段的下一个状态：本段声明的 next 候选按顺序取第一个守卫通过者；无 → undefined（链终止） */
export const resolveNextSegment = (
    attacks: WeaponAttacks,
    segment: AttackSegment,
    ctx: AttackTransitionContext,
): AttackSegment | undefined => {
    for (const transition of segment.next) {
        const next = findSegment(attacks, transition.to)
        if (next === undefined) continue
        if (!evalGuard(transition.guard, ctx)) continue
        return next
    }
    return undefined
}

/**
 * 按攻击键分组的有序段清单（HUD / 展示模式 / 骨骼动画内置动作库的统一枚举顺序）：
 * 每个攻击键先按 `steps` 主干顺序（同链 1、2… 段相邻），再补该键的其它段（条件起手变体，如蓄力段）。
 */
export const orderedSegments = (attacks: WeaponAttacks): readonly AttackSegment[] => {
    const out: AttackSegment[] = []
    const taken = new Set<string>()
    for (const key of ATTACK_KEYS) {
        const chain = chainOf(attacks, key)
        for (const segmentId of chain.steps) {
            const segment = findSegment(attacks, segmentId)
            if (segment === undefined || taken.has(segment.id)) continue
            taken.add(segment.id)
            out.push(segment)
        }
        for (const segment of Object.values(attacks.segments)) {
            if (segment.key !== key || taken.has(segment.id)) continue
            taken.add(segment.id)
            out.push(segment)
        }
    }
    return out
}

/** 段序号中文（链内序号 1-based，超出范围回退阿拉伯数字） */
const STEP_LABELS = ['一', '二', '三', '四', '五', '六'] as const

/** 段的展示名（缺省 轻击/重击 + 序号；条件变体段由武器模组给 label） */
export const segmentDisplayName = (segment: AttackSegment): string =>
    segment.label ?? `${ATTACK_KEY_LABELS[segment.key]}${STEP_LABELS[segment.step - 1] ?? segment.step}段`

/** 段总时长（动作 + 恢复） */
export const segmentTotalDuration = (segment: AttackSegment): number =>
    segment.duration + segment.recovery
