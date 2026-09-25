import type {AttackAnimConfig, AttackPhase, AttackType} from '../combat/attack_phases.ts'
import {DEFAULT_ANIM} from '../combat/attack_phases.ts'
import type {AttackEntry, AttackKey, AttackSegment, AttackTransition, WeaponAttackChain, WeaponAttacks} from './attack_chain.ts'

/**
 * 近战武器攻击段模板（武器模组固有数据）：
 * 每把近战武器拥有 4 个主干段 —— 轻链 1/2 段 + 重链 1/2 段；
 * 段内玩法参数（幅度/倾斜角/伤害倍率）在此声明，动画与命中窗口由段 id 驱动。
 */

/** 轻段动作时间（秒，仅挥砍动作，不含后摇） */
export const MELEE_LIGHT_DURATION = 0.2
/** 重段动作时间（秒，仅挥砍动作，不含后摇） */
export const MELEE_HEAVY_DURATION = 0.3
/** 轻段恢复时间（秒，动作结束后的后摇） */
export const MELEE_LIGHT_RECOVERY = 0.2
/** 重段恢复时间（秒，动作结束后的后摇） */
export const MELEE_HEAVY_RECOVERY = 0.2
/** 重段伤害倍率（相对武器基础伤害） */
export const MELEE_HEAVY_DAMAGE_MULTIPLIER = 1.6

/** 每武器链段动作风格：幅度系数（短剑 1.0 = 小而快）+ 是否双手持握 */
export interface MeleeAttackStyle {
    readonly amp: number
    readonly twoHanded: boolean
}

const MELEE_ATTACK_STYLES: Record<string, MeleeAttackStyle> = {
    short_sword: {amp: 1.0, twoHanded: false},
    long_sword: {amp: 1.25, twoHanded: false},
    heavy_sword: {amp: 1.5, twoHanded: true},
    spear: {amp: 1.2, twoHanded: true},
    dual_axe: {amp: 1.15, twoHanded: false},
    war_hammer: {amp: 1.5, twoHanded: true},
}

const DEFAULT_ATTACK_STYLE: MeleeAttackStyle = {amp: 1.2, twoHanded: false}

export const meleeAttackStyleOf = (weaponId: string): MeleeAttackStyle =>
    MELEE_ATTACK_STYLES[weaponId] ?? DEFAULT_ATTACK_STYLE

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

/**
 * 段模板表 —— **新增一段近战动作只需要在这里加一行**（外加 `MELEE_SEGMENT_KEYS` 加键、
 * `MELEE_CHAIN_SPECS` 的对应链 `steps` 里加入该键），无需改状态机、存档或任何 UI：
 * - `anim` 是打击段的动画参数（`armSwingForwardX` 会乘上武器风格幅度系数 `style.amp`）；
 * - `swingTilt` 是段固有挥砍倾斜角（确定性方向，非轮转）；
 * - `heavy` 决定时长/伤害倍率（重段 = 0.3+0.2s、伤害 ×1.6）。
 */
interface MeleeSegmentTemplate {
    readonly key: AttackKey
    readonly step: number
    readonly heavy: boolean
    readonly anim: {
        readonly armSwingForwardX: number
        readonly elbowBend: number
        readonly bodyLean: number
        readonly attackType: AttackType
        readonly strikePeakRatio: number
        readonly overshootRatio: number
    }
    readonly swingTilt: number
}

const MELEE_SEGMENT_TEMPLATES: Readonly<Record<MeleeSegmentKey, MeleeSegmentTemplate>> = {
    /* 上至下竖劈：幅度小而快 */
    light_1: {
        key: 'light', step: 1, heavy: false, swingTilt: 0,
        anim: {armSwingForwardX: 2.0, elbowBend: 0.25, bodyLean: 0.06, attackType: 'slash', strikePeakRatio: 0.7, overshootRatio: 0.15},
    },
    /* 水平向前直刺：探身 + 手臂前伸（thrust 不受倾斜角影响） */
    light_2: {
        key: 'light', step: 2, heavy: false, swingTilt: 0,
        anim: {armSwingForwardX: 1.6, elbowBend: 0.15, bodyLean: 0.12, attackType: 'thrust', strikePeakRatio: 0.6, overshootRatio: 0.1},
    },
    /* 上挑斜斩（三段轻链的收招段）：右向斜挑，幅度略大于首段 */
    light_3: {
        key: 'light', step: 3, heavy: false, swingTilt: -Math.PI * 0.12,
        anim: {armSwingForwardX: 2.1, elbowBend: 0.22, bodyLean: 0.09, attackType: 'slash', strikePeakRatio: 0.68, overshootRatio: 0.14},
    },
    /* 水平横向挥砍：拧腰动力链大幅横摆 */
    heavy_1: {
        key: 'heavy', step: 1, heavy: true, swingTilt: Math.PI * 0.48,
        anim: {armSwingForwardX: 2.4, elbowBend: 0.3, bodyLean: 0.05, attackType: 'slash', strikePeakRatio: 0.75, overshootRatio: 0.2},
    },
    /* 斜向挥砍 */
    heavy_2: {
        key: 'heavy', step: 2, heavy: true, swingTilt: -Math.PI * 0.22,
        anim: {armSwingForwardX: 2.3, elbowBend: 0.3, bodyLean: 0.06, attackType: 'slash', strikePeakRatio: 0.7, overshootRatio: 0.18},
    },
}

/** 打击段动画参数：模板参数 + 武器风格幅度/双手持握 */
const strikeAnim = (segmentKey: MeleeSegmentKey, style: MeleeAttackStyle): AttackAnimConfig => {
    const {anim} = MELEE_SEGMENT_TEMPLATES[segmentKey]
    return {
        ...DEFAULT_ANIM,
        armSwingForwardX: anim.armSwingForwardX * style.amp,
        elbowBend: anim.elbowBend,
        bodyLean: anim.bodyLean,
        attackType: anim.attackType,
        strikePeakRatio: anim.strikePeakRatio,
        overshootRatio: anim.overshootRatio,
        twoHanded: style.twoHanded,
    }
}

/** 段阶段序列：strike 动作段（ratio = 1） + recovery 恢复段（ratio 不参与计算，时长取段 recovery） */
const segmentPhases = (segmentKey: MeleeSegmentKey, style: MeleeAttackStyle): readonly AttackPhase[] => [
    {
        name: 'strike',
        durationRatio: 1,
        moveSpeedMultiplier: 0.3,
        cancellable: false,
        animConfig: strikeAnim(segmentKey, style),
    },
    {
        name: 'recovery',
        durationRatio: 0,
        moveSpeedMultiplier: 0.35,
        cancellable: false,
        animConfig: {...DEFAULT_ANIM, elbowBend: 0.2, bodyLean: 0, twoHanded: style.twoHanded},
    },
]

/** 段 id：`{weaponId}_{模板键}`（与武器一一对应，同时是动画键与清单键） */
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
 * 想给所有近战加「轻 3 / 重 3」→ 在 MELEE_SEGMENT_KEYS + 本表加模板键与序列即可；
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
 * - 段：按链编排涉及的模板键生成（时长/阶段/倾斜角由武器风格决定，重段伤害倍率 1.6）；
 * - 起手：缺省各键第一个主干段（无守卫，普通攻击恒定可起手）；
 * - 连段：**由段自身声明的 next 转换表达**，next 由链编排生成（轻 1 ↔ 轻 2、重 1 ↔ 重 2 循环）。
 */
export const buildMeleeAttacks = (
    weaponId: string,
    style: MeleeAttackStyle = DEFAULT_ATTACK_STYLE,
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
        const spec = chains[meta.key]
        const heavy = meta.heavy
        return {
            id: meleeSegmentId(weaponId, segmentKey),
            key: meta.key,
            step: meta.step,
            duration: heavy ? MELEE_HEAVY_DURATION : MELEE_LIGHT_DURATION,
            recovery: heavy ? MELEE_HEAVY_RECOVERY : MELEE_LIGHT_RECOVERY,
            phases: segmentPhases(segmentKey, style),
            swingTilt: MELEE_SEGMENT_TEMPLATES[segmentKey].swingTilt,
            damageMultiplier: heavy ? MELEE_HEAVY_DAMAGE_MULTIPLIER : 1,
            cooldown: 0,
            next: transitionsFor(weaponId, spec, segmentKey),
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
