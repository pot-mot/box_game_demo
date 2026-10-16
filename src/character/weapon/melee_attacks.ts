import type {AttackPhase} from '../combat/attack_phases.ts'
import type {ImpactLevel} from '../combat/impact.ts'
import type {AttackEntry, AttackKey, AttackSegment, AttackTransition, GroundAttackKey, WeaponAttackChain, WeaponAttacks} from './attack_chain.ts'
import type {HoldMode} from './hold_mode.ts'
import {chargeDamageBonusOf, type ChargeTuning} from './charge_tuning.ts'

/**
 * 近战武器攻击链（武器类固有数据）：
 * 每个攻击段只声明**玩法数据**（时长/恢复/阶段时序/伤害倍率/冷却/连段拓扑）；
 * 动画是段 id 对应的显式骨骼关键帧（`attack_clip_data.ts` 基础轨道 + `attack_pose_edits.ts` 逐段修订），不再有抽象动画参数。
 *
 * **段 id 约定**：`{classId}_{holdMode}_{模板键}`（如 `long_sword_two_handed_light_1`）——
 * 每种持握模式拥有独立段 id 命名空间，三模式连段互不覆盖。
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
/** 轻段默认冲击力（弱硬直：不打断攻击，仅中断非承诺动作） */
export const MELEE_LIGHT_IMPACT: ImpactLevel = 'medium'
/** 轻段默认削韧值 */
export const MELEE_LIGHT_POISE_DAMAGE = 1
/** 重段默认冲击力（强硬直：打断攻击与持续动作） */
export const MELEE_HEAVY_IMPACT: ImpactLevel = 'heavy'
/** 重段默认削韧值 */
export const MELEE_HEAVY_POISE_DAMAGE = 4

/** 重击蓄力配置（武器模板默认，可被单武器 / 面板覆盖）：蓄力调参 + 冷却 + 蓄力姿势 */
export interface HeavyChargeConfig extends ChargeTuning {
    /** 蓄力重击冷却（秒，仅蓄力值 > 0 时挂起；短按普通重击不触发） */
    readonly cooldown: number
    /** 专用蓄力姿势 clip 覆写（缺省按持握模式取 `charge_melee_{holdMode}`） */
    readonly chargePoseId?: string
}

/** 重击蓄力默认值：满蓄力 1s → 200%（×2）、冷却 0.8s（所有近战武器默认启用） */
export const DEFAULT_HEAVY_CHARGE: HeavyChargeConfig = {maxChargeMultiplier: 200, maxChargeTime: 1, cooldown: 0.8}

/** 近战段模板键：键组 + 链内序号（模板可被任意武器引用；某武器是否使用由链编排 `steps` 决定） */
export const MELEE_SEGMENT_KEYS = ['light_1', 'light_2', 'light_3', 'heavy_1', 'heavy_2'] as const
export type MeleeSegmentKey = typeof MELEE_SEGMENT_KEYS[number]

/**
 * 空中段模板键（与地面段命名空间分离；段数可与地面不同）。
 * 空中段不单独烘焙关键帧，动画经 `MeleeAirAttackConfig.poseKeys` 复用地面段 pose。
 */
export const MELEE_AIR_SEGMENT_KEYS = ['air_1', 'air_2'] as const
export type MeleeAirSegmentKey = typeof MELEE_AIR_SEGMENT_KEYS[number]

/** 空中段动作时间（秒，仅挥砍动作，不含后摇） */
export const MELEE_AIR_DURATION = 0.32
/** 空中段恢复时间（秒，动作结束后的后摇） */
export const MELEE_AIR_RECOVERY = 0.2
/** 空中段伤害倍率（相对武器基础伤害，略高于地面轻击） */
export const MELEE_AIR_DAMAGE_MULTIPLIER = 1.25
/** 空中段默认冲击力（弱硬直） */
export const MELEE_AIR_IMPACT: ImpactLevel = 'medium'
/** 空中段默认削韧值 */
export const MELEE_AIR_POISE_DAMAGE = 2

/** 段模板键 → 攻击键/序号/是否重段 */
const SEGMENT_META: Record<MeleeSegmentKey, {key: 'light' | 'heavy'; step: number; heavy: boolean}> = {
    light_1: {key: 'light', step: 1, heavy: false},
    light_2: {key: 'light', step: 2, heavy: false},
    light_3: {key: 'light', step: 3, heavy: false},
    heavy_1: {key: 'heavy', step: 1, heavy: true},
    heavy_2: {key: 'heavy', step: 2, heavy: true},
}

/** 段阶段时序：strike 动作段（ratio = 1） + recovery 恢复段（ratio 不参与计算，时长取段 recovery）；
 *  重击段的 strike 声明 `chargeable`，按住时冻结在起手帧蓄力。 */
const segmentPhases = (chargeable = false): readonly AttackPhase[] => [
    {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false, ...(chargeable ? {chargeable: true} : {})},
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false},
]

/** 空中段阶段时序：strike（ratio 1）+ recovery；空中段不可蓄力。 */
const airSegmentPhases = (): readonly AttackPhase[] => [
    {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false},
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.5, cancellable: false},
]

/** 段 id：`{classId}_{holdMode}_{模板键}`（与武器类 + 持握模式一一对应，同时是动画键与骨骼动画数据键） */
export const meleeSegmentId = (classId: string, holdMode: HoldMode, segmentKey: MeleeSegmentKey): string =>
    `${classId}_${holdMode}_${segmentKey}`

/** 空中段 id：`{classId}_{holdMode}_{air_N}`（命名空间与地面段分离） */
export const meleeAirSegmentId = (classId: string, holdMode: HoldMode, airKey: MeleeAirSegmentKey): string =>
    `${classId}_${holdMode}_${airKey}`

/** 近战默认专用蓄力姿势 clip id（按持握模式共享；武器类可经 `heavyCharge.chargePoseId` 覆写） */
export const meleeChargePoseId = (holdMode: HoldMode): string => `charge_melee_${holdMode}`

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
export const MELEE_CHAIN_SPECS: Readonly<Record<GroundAttackKey, MeleeChainSpec>> = {
    light: {steps: ['light_1', 'light_2'], loop: true},
    heavy: {steps: ['heavy_1', 'heavy_2'], loop: true},
}

/**
 * 空中攻击模组配置（武器类拥有）：
 * 「跳跃中按攻击键」时由 `air_attacking` 状态读取——空中不单独烘焙关键帧，
 * 每段动画经 `poseKeys` 复用地面段 pose；动量/操控/砸地由武器种类决定（段数可与地面不同）。
 */
export interface MeleeAirAttackConfig {
    /** 空中链主干段（顺序 = 播放与清单顺序；段数可与地面不同） */
    readonly steps: readonly MeleeAirSegmentKey[]
    /** true = 末段 next 回首段（循环）；false = 末段终止（空中通常单段） */
    readonly loop: boolean
    /** 空中攻击期间的每帧水平动量保留系数（0~1；1 = 完全保持起跳惯性，0 = 每帧清空） */
    readonly momentum: number
    /** 空中攻击期间输入对水平速度的操控系数（0~1；越小越不可转向） */
    readonly airControl: number
    /** 打击段起始施加的向下冲量（m/s，0 = 无；战锤「跳跃砸地」用） */
    readonly slamSpeed: number
    /** 每段动画复用的地面段模板键（与 `steps` 一一对应；缺省按轻击 1 段） */
    readonly poseKeys: readonly MeleeSegmentKey[]
}

/** 默认空中攻击模组：单段、保留惯性、低操控、无砸地、复用轻击 1 段动画 */
export const DEFAULT_MELEE_AIR_ATTACK: MeleeAirAttackConfig = {
    steps: ['air_1'], loop: false, momentum: 0.98, airControl: 0.35, slamSpeed: 0, poseKeys: ['light_1'],
}

/** 单段冲击力 / 削韧覆写（缺省字段沿用重段/轻段/空中段默认值） */
export interface SegmentImpactOverride {
    readonly impact?: ImpactLevel
    readonly poiseDamage?: number
}

/** 构建近战攻击链的可选覆盖项（武器独立编排 / 追加特殊段 / 起手候选覆写） */
export interface BuildMeleeAttacksOptions {
    /** 链编排覆写（缺省 = MELEE_CHAIN_SPECS） */
    readonly chains?: Partial<Record<GroundAttackKey, MeleeChainSpec>>
    /** 追加段（条件变体段 / 特殊技；可被 entries 或其它段的 next 引用，也可仅出现在清单中） */
    readonly extraSegments?: readonly AttackSegment[]
    /** 起手候选覆写（缺省 = 各键第一段，无守卫；守卫变体应声明在兜底候选之前） */
    readonly entries?: Partial<Record<AttackKey, readonly AttackEntry[]>>
    /** 空中攻击模组覆写（缺省 = DEFAULT_MELEE_AIR_ATTACK） */
    readonly air?: MeleeAirAttackConfig
    /** 逐段冲击力 / 削韧覆写（键 = 模板键，地面与空中段共用命名空间） */
    readonly impact?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, SegmentImpactOverride>>
    /**
     * 重击蓄力配置：提供后，本模式的重击段声明为可蓄力（`chargeFullTime` + strike `chargeable`），
     * 按住攻击键即冻结在重击起手帧蓄力、松开出手；伤害按蓄力值连续缩放，蓄力值 > 0 时挂冷却。
     */
    readonly heavyCharge?: HeavyChargeConfig
}

/** 由链编排生成段转换：loop → 末段回首段；非 loop → 顺序推进、末段无候选（链终止） */
const transitionsFor = (classId: string, holdMode: HoldMode, spec: MeleeChainSpec, step: MeleeSegmentKey): readonly AttackTransition[] => {
    const index = spec.steps.indexOf(step)
    if (index < 0) return []
    const nextKey = spec.steps[index + 1] ?? (spec.loop ? spec.steps[0] : undefined)
    return nextKey !== undefined ? [{to: meleeSegmentId(classId, holdMode, nextKey)}] : []
}

/**
 * 构建近战武器类某持握模式的攻击链：
 * - 段：按链编排涉及的模板键生成（时长由轻重决定，重段伤害倍率 1.6）；
 * - 起手：缺省各键第一个主干段（无守卫，普通攻击恒定可起手）；
 * - 连段：**由段自身声明的 next 转换表达**。
 */
export const buildMeleeAttacks = (
    classId: string,
    holdMode: HoldMode,
    options: BuildMeleeAttacksOptions = {},
): WeaponAttacks => {
    const chains: Record<GroundAttackKey, MeleeChainSpec> = {
        light: options.chains?.light ?? MELEE_CHAIN_SPECS.light,
        heavy: options.chains?.heavy ?? MELEE_CHAIN_SPECS.heavy,
    }
    const air = options.air ?? DEFAULT_MELEE_AIR_ATTACK

    /** 编排涉及的全部模板键（保持 MELEE_SEGMENT_KEYS 声明顺序，保证段索引顺序稳定） */
    const usedKeys = MELEE_SEGMENT_KEYS.filter(key => chains.light.steps.includes(key) || chains.heavy.steps.includes(key))

    const heavyCharge = options.heavyCharge

    const make = (segmentKey: MeleeSegmentKey): AttackSegment => {
        const meta = SEGMENT_META[segmentKey]
        const heavy = meta.heavy
        const id = meleeSegmentId(classId, holdMode, segmentKey)
        /* 重击段可蓄力：按住攻击键冻结在 strike 起始帧蓄力，松开出手 */
        const chargeable = heavy && heavyCharge !== undefined
        const impactOverride = options.impact?.[segmentKey]
        return {
            id,
            key: meta.key,
            step: meta.step,
            duration: heavy ? MELEE_HEAVY_DURATION : MELEE_LIGHT_DURATION,
            recovery: heavy ? MELEE_HEAVY_RECOVERY : MELEE_LIGHT_RECOVERY,
            phases: segmentPhases(chargeable),
            /* 动作组合：默认单层（段 id 即 pose 资产 id），可继续追加分层 pose 与权重 */
            poses: [{poseId: id, weight: 1}],
            damageMultiplier: heavy ? MELEE_HEAVY_DAMAGE_MULTIPLIER : 1,
            impact: impactOverride?.impact ?? (heavy ? MELEE_HEAVY_IMPACT : MELEE_LIGHT_IMPACT),
            poiseDamage: impactOverride?.poiseDamage ?? (heavy ? MELEE_HEAVY_POISE_DAMAGE : MELEE_LIGHT_POISE_DAMAGE),
            cooldown: 0,
            ...(chargeable && heavyCharge !== undefined ? {
                chargeFullTime: heavyCharge.maxChargeTime,
                chargeDamageBonus: chargeDamageBonusOf(heavyCharge),
                chargeCooldown: heavyCharge.cooldown,
                chargePoseId: heavyCharge.chargePoseId ?? meleeChargePoseId(holdMode),
            } : {}),
            next: transitionsFor(classId, holdMode, chains[meta.key], segmentKey),
        }
    }

    const segments: Record<string, AttackSegment> = {}
    for (const segmentKey of usedKeys) {
        const segment = make(segmentKey)
        segments[segment.id] = segment
    }

    /* 空中段：独立命名空间，动画复用地面段 pose（不单独烘焙关键帧）；
     * poseKeys 必须与 steps 一一对应且指向本模式实际生成的地面段（fail loudly，避免静默回退到不存在的 clip） */
    if (air.poseKeys.length !== air.steps.length) {
        throw new Error(`近战空中攻击模组错误（${classId}/${holdMode}）：poseKeys 数量（${air.poseKeys.length}）须与 steps 数量（${air.steps.length}）一致`)
    }
    for (const poseKey of air.poseKeys) {
        if (!usedKeys.includes(poseKey)) {
            throw new Error(`近战空中攻击模组错误（${classId}/${holdMode}）：poseKeys 引用了未生成的地面段模板键（${poseKey}）`)
        }
    }
    const airIds = air.steps.map(step => meleeAirSegmentId(classId, holdMode, step))
    air.steps.forEach((_step, index) => {
        const id = airIds[index]
        const nextId = airIds[index + 1] ?? (air.loop ? airIds[0] : undefined)
        const poseKey = air.poseKeys[index]
        const impactOverride = options.impact?.[_step]
        segments[id] = {
            id,
            key: 'air',
            step: index + 1,
            duration: MELEE_AIR_DURATION,
            recovery: MELEE_AIR_RECOVERY,
            phases: airSegmentPhases(),
            poses: [{poseId: meleeSegmentId(classId, holdMode, poseKey), weight: 1}],
            damageMultiplier: MELEE_AIR_DAMAGE_MULTIPLIER,
            impact: impactOverride?.impact ?? MELEE_AIR_IMPACT,
            poiseDamage: impactOverride?.poiseDamage ?? MELEE_AIR_POISE_DAMAGE,
            cooldown: 0,
            next: nextId !== undefined ? [{to: nextId}] : [],
        }
    })

    for (const extra of options.extraSegments ?? []) {
        if (segments[extra.id] !== undefined) {
            throw new Error(`近战攻击链构建失败：追加段 id 与模板段冲突（${extra.id}）`)
        }
        segments[extra.id] = extra
    }

    const chainOfKey = (key: GroundAttackKey): WeaponAttackChain => {
        const steps = chains[key].steps.map(step => meleeSegmentId(classId, holdMode, step))
        const entries = options.entries?.[key] ?? (steps.length > 0 ? [{segmentId: steps[0]}] : [])
        return {key, entries, steps}
    }

    const airChain: WeaponAttackChain = {
        key: 'air',
        entries: options.entries?.air ?? (airIds.length > 0 ? [{segmentId: airIds[0]}] : []),
        steps: airIds,
    }

    return {segments, chains: {light: chainOfKey('light'), heavy: chainOfKey('heavy'), air: airChain}}
}
