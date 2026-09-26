import type {AttackPhase} from '../combat/attack_phases.ts'
import type {AttackEntry, AttackKey, AttackSegment, AttackTransition, WeaponAttackChain, WeaponAttacks} from './attack_chain.ts'

/**
 * 近战武器攻击链（武器模组固有数据）：
 * 每个攻击段只声明**玩法数据**（时长/恢复/阶段时序/伤害倍率/冷却/连段拓扑）；
 * 动画是段 id 对应的显式骨骼关键帧（`attack_clip_data.ts` 基础轨道 + `attack_pose_edits.ts` 逐段修订），不再有抽象动画参数。
 */

/** 轻段动作时间（秒，仅挥砍动作，不含后摇）：原 0.2s 的 0.75 倍速（0.267s，总时长与 clip 关键帧对齐） */
export const MELEE_LIGHT_DURATION = 0.267
/** 重段动作时间（秒，仅挥砍动作，不含后摇）：原 0.3s 的 0.75 倍速（0.4s） */
export const MELEE_HEAVY_DURATION = 0.4
/** 轻段恢复时间（秒，动作结束后的后摇）：与原 0.2s 的 0.75 倍速对齐（轻段总时长 0.533s） */
export const MELEE_LIGHT_RECOVERY = 0.266
/** 重段恢复时间（秒，动作结束后的后摇）：与原 0.2s 的 0.75 倍速对齐（重段总时长 0.667s） */
export const MELEE_HEAVY_RECOVERY = 0.267
/** 重段伤害倍率（相对武器基础伤害） */
export const MELEE_HEAVY_DAMAGE_MULTIPLIER = 1.6

/** 近战段模板键：键组 + 链内序号（模板可被任意武器引用；某武器是否使用由链编排 `steps` 决定） */
export const MELEE_SEGMENT_KEYS = ['light_1', 'light_2', 'light_3', 'heavy_1', 'heavy_2'] as const
export type MeleeSegmentKey = typeof MELEE_SEGMENT_KEYS[number]

/** 段模板键 → 攻击键/序号/是否重段 */
const SEGMENT_META: Record<MeleeSegmentKey, {key: 'light' | 'heavy'; step: number; heavy: boolean}> = {
    light_1: {key: 'light', step: 1, heavy: false},
    light_2: {key: 'light', step: 2, heavy: false},
    light_3: {key: 'light', step: 3, heavy: false},
    heavy_1: {key: 'heavy', step: 1, heavy: true},
    heavy_2: {key: 'heavy', step: 2, heavy: true},
}

/** 段阶段时序：strike 动作段（ratio = 1） + recovery 恢复段（ratio 不参与计算，时长取段 recovery） */
const segmentPhases = (): readonly AttackPhase[] => [
    {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false},
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false},
]

/** 段 id：`{weaponId}_{模板键}`（与武器一一对应，同时是动画键与清单键、以及骨骼动画数据键） */
export const meleeSegmentId = (weaponId: string, segmentKey: MeleeSegmentKey): string =>
    `${weaponId}_${segmentKey}`

/** 单条攻击键链的编排：主干段模板序列（顺序 = 播放与清单顺序）+ 是否循环回第一段 */
export interface MeleeChainSpec {
    readonly steps: readonly MeleeSegmentKey[]
    /** true = 末段 next 回到首段（循环链）；false = 末段终止（播完收招） */
    readonly loop: boolean
}

/**
 * 生产近战武器的链编排 —— **增删段/改循环只改这一处**：
 * 单段链请用 `loop: false`（loop 的单段链 next 指向自身，按住攻击会连续重播同一段）。
 */
export const MELEE_CHAIN_SPECS: Readonly<Record<AttackKey, MeleeChainSpec>> = {
    light: {steps: ['light_1', 'light_2'], loop: true},
    heavy: {steps: ['heavy_1', 'heavy_2'], loop: true},
}

/** 构建近战攻击链的可选覆盖项（武器独立编排 / 追加特殊段 / 起手候选覆写） */
export interface BuildMeleeAttacksOptions {
    /** 链编排覆写（缺省 = MELEE_CHAIN_SPECS） */
    readonly chains?: Partial<Record<AttackKey, MeleeChainSpec>>
    /** 追加段（条件变体段 / 特殊技；可被 entries 或其它段的 next 引用，也可仅出现在清单中） */
    readonly extraSegments?: readonly AttackSegment[]
    /** 起手候选覆写（缺省 = 各键第一段，无守卫；守卫变体应声明在兜底候选之前） */
    readonly entries?: Partial<Record<AttackKey, readonly AttackEntry[]>>
}

/** 由链编排生成段转换：loop → 末段回首段；非 loop → 顺序推进、末段无候选（链终止） */
const transitionsFor = (weaponId: string, spec: MeleeChainSpec, step: MeleeSegmentKey): readonly AttackTransition[] => {
    const index = spec.steps.indexOf(step)
    if (index < 0) return []
    const nextKey = spec.steps[index + 1] ?? (spec.loop ? spec.steps[0] : undefined)
    return nextKey !== undefined ? [{to: meleeSegmentId(weaponId, nextKey)}] : []
}

/**
 * 构建近战武器攻击链：
 * - 段：按链编排涉及的模板键生成（时长由轻重决定，重段伤害倍率 1.6）；
 * - 起手：缺省各键第一个主干段（无守卫，普通攻击恒定可起手）；
 * - 连段：**由段自身声明的 next 转换表达**。
 */
export const buildMeleeAttacks = (
    weaponId: string,
    options: BuildMeleeAttacksOptions = {},
): WeaponAttacks => {
    const chains: Record<AttackKey, MeleeChainSpec> = {
        light: options.chains?.light ?? MELEE_CHAIN_SPECS.light,
        heavy: options.chains?.heavy ?? MELEE_CHAIN_SPECS.heavy,
    }

    /** 编排涉及的全部模板键（保持 MELEE_SEGMENT_KEYS 声明顺序，保证段索引顺序稳定） */
    const usedKeys = MELEE_SEGMENT_KEYS.filter(key => chains.light.steps.includes(key) || chains.heavy.steps.includes(key))

    const make = (segmentKey: MeleeSegmentKey): AttackSegment => {
        const meta = SEGMENT_META[segmentKey]
        const heavy = meta.heavy
        const id = meleeSegmentId(weaponId, segmentKey)
        return {
            id,
            key: meta.key,
            step: meta.step,
            duration: heavy ? MELEE_HEAVY_DURATION : MELEE_LIGHT_DURATION,
            recovery: heavy ? MELEE_HEAVY_RECOVERY : MELEE_LIGHT_RECOVERY,
            phases: segmentPhases(),
            /* 动作组合：默认单层（段 id 即 pose 资产 id），可继续追加分层 pose 与权重 */
            poses: [{poseId: id, weight: 1}],
            damageMultiplier: heavy ? MELEE_HEAVY_DAMAGE_MULTIPLIER : 1,
            cooldown: 0,
            next: transitionsFor(weaponId, chains[meta.key], segmentKey),
        }
    }

    const segments: Record<string, AttackSegment> = {}
    for (const segmentKey of usedKeys) {
        const segment = make(segmentKey)
        segments[segment.id] = segment
    }
    for (const extra of options.extraSegments ?? []) {
        if (segments[extra.id] !== undefined) {
            throw new Error(`近战攻击链构建失败：追加段 id 与模板段冲突（${extra.id}）`)
        }
        segments[extra.id] = extra
    }

    const chainOfKey = (key: AttackKey): WeaponAttackChain => {
        const steps = chains[key].steps.map(step => meleeSegmentId(weaponId, step))
        const entries = options.entries?.[key] ?? (steps.length > 0 ? [{segmentId: steps[0]}] : [])
        return {key, entries, steps}
    }

    return {segments, chains: {light: chainOfKey('light'), heavy: chainOfKey('heavy')}}
}
