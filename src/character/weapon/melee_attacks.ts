import type {AttackPhase} from '../combat/attack_phases.ts'
import type {ImpactLevel} from '../combat/impact.ts'
import {effectiveChargeFullTime} from './attack_chain.ts'
import type {AttackEntry, AttackImpulse, AttackKey, AttackSegment, AttackTransition, GroundAttackKey, WeaponAttackChain, WeaponAttacks} from './attack_chain.ts'
import type {HoldMode} from './hold_mode.ts'
import {chargeDamageBonusOf, type ChargeTuning} from './charge_tuning.ts'

/**
 * 近战武器攻击链（武器类固有数据）：
 * 每个攻击段只声明**玩法数据**（时长/恢复/阶段时序/伤害倍率/冷却/连段拓扑）；
 * 动画是段 id 对应的显式骨骼关键帧（作者数据按体形/武器拆分），不再有抽象动画参数。
 *
 * **段 id 约定**：`{classId}_{holdMode}_{模板键}`（如 `long_sword_two_handed_light_1`）——
 * 每种持握模式拥有独立段 id 命名空间，三模式连段互不覆盖。
 */

/** 轻段抬手时间（秒）：持械戒备 → 满后引（动作 2:1:2.5 中的「2」） */
export const MELEE_LIGHT_WINDUP = 0.4
/** 轻段挥砍时间（秒）：满后引 → 打击完成（动作 2:1:2.5 中的「1」） */
export const MELEE_LIGHT_ATTACK = 0.2
/** 轻段动作时间（秒，抬手 + 挥砍，不含后摇）：0.6s（轻段总时长 1.1s） */
export const MELEE_LIGHT_DURATION = MELEE_LIGHT_WINDUP + MELEE_LIGHT_ATTACK
/** 轻段恢复时间（秒，打击完成后的后摇）：0.5s（动作 2:1:2.5 中的「2.5」） */
export const MELEE_LIGHT_RECOVERY = 0.5
/** 重段抬手时间（秒）：持械戒备 → 满后引 */
export const MELEE_HEAVY_WINDUP = 0.48
/** 重段挥砍时间（秒）：满后引 → 打击完成 */
export const MELEE_HEAVY_ATTACK = 0.24
/** 重段动作时间（秒，抬手 + 挥砍，不含后摇）：0.72s（重段总时长 1.32s） */
export const MELEE_HEAVY_DURATION = MELEE_HEAVY_WINDUP + MELEE_HEAVY_ATTACK
/** 重段恢复时间（秒，打击完成后的后摇）：0.6s */
export const MELEE_HEAVY_RECOVERY = 0.6
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

/** 重击蓄力配置（武器模板默认，可被单武器 / 面板覆盖）：蓄力调参 + 冷却 */
export interface HeavyChargeConfig extends ChargeTuning {
    /** 蓄力重击冷却（秒，仅蓄力值 > 0 时挂起；短按普通重击不触发） */
    readonly cooldown: number
}

/** 重击蓄力默认值：满蓄力 1s → 200%（×2）、冷却 0.8s（所有近战武器默认启用） */
export const DEFAULT_HEAVY_CHARGE: HeavyChargeConfig = {maxChargeMultiplier: 200, maxChargeTime: 1, cooldown: 0.8}

/** 近战段模板键：键组 + 链内序号（模板可被任意武器引用；某武器是否使用由链编排 `steps` 决定） */
export const MELEE_SEGMENT_KEYS = ['light_1', 'light_2', 'light_3', 'light_4', 'light_5', 'heavy_1', 'heavy_2'] as const
export type MeleeSegmentKey = typeof MELEE_SEGMENT_KEYS[number]

/**
 * 空中段模板键（与地面段命名空间分离；段数可与地面不同）。
 * 空中段拥有自己的 clip 数据（`attack_clips/` 的 `_air_N` 条目）；`poseKeys` 只记录
 * 「该空中段的姿势基底取自哪个地面段」，仅在生成 clip 数据时使用，运行时不再引用地面 pose。
 */
export const MELEE_AIR_SEGMENT_KEYS = ['air_1', 'air_2'] as const
export type MeleeAirSegmentKey = typeof MELEE_AIR_SEGMENT_KEYS[number]

/** 空中段抬手时间（秒）：复用地面轻段节奏（总时长 1.1s） */
export const MELEE_AIR_WINDUP = 0.4
/** 空中段挥砍时间（秒）：满后引 → 打击完成 */
export const MELEE_AIR_ATTACK = 0.2
/** 空中段动作时间（秒，抬手 + 挥砍，不含后摇）：0.6s */
export const MELEE_AIR_DURATION = MELEE_AIR_WINDUP + MELEE_AIR_ATTACK
/** 空中段恢复时间（秒，打击完成后的后摇）：0.5s */
export const MELEE_AIR_RECOVERY = 0.5
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
    light_4: {key: 'light', step: 4, heavy: false},
    light_5: {key: 'light', step: 5, heavy: false},
    heavy_1: {key: 'heavy', step: 1, heavy: true},
    heavy_2: {key: 'heavy', step: 2, heavy: true},
}

/** 重击蓄力保持期间的移速倍率：比不蓄力的 0.3 略快，仍显著慢于行走，配合下半身行走动画 */
export const MELEE_CHARGE_MOVE_SPEED_MULTIPLIER = 0.5

/** 动作阶段（抬手 / 挥砍）移速倍率：攻击期间显著减速 */
const MELEE_ACTION_MOVE_SPEED = 0.3
/** 后摇阶段移速倍率：略快于动作阶段，便于收招后衔接移动 */
const MELEE_RECOVERY_MOVE_SPEED = 0.35
/** 空中段移速倍率：空中攻击全程保持较低的空中操控 */
const MELEE_AIR_MOVE_SPEED = 0.5

/**
 * 段阶段时序：windup 抬手 → strike 挥砍 → recovery 后摇（后摇比例不参与分摊，时长取段 recovery）。
 * **动作阶段比例由抬手 / 挥砍时长推导**（`windup / (windup + attack)`），保证阶段时长与命名常量恒等
 * （`MELEE_*_WINDUP` 就是抬手段时长，蓄力时长下限据此取用）。
 * 重击段的 **windup** 声明 `chargeable`：按住时冻结在抬手起始帧（持械戒备）播放蓄力姿势，
 * 松开后按已蓄力进度继续播完剩余抬手再进入挥砍（移速改用 `MELEE_CHARGE_MOVE_SPEED_MULTIPLIER`）。
 */
const segmentPhases = (
    windup: number,
    attack: number,
    moveSpeed: {readonly action: number; readonly recovery: number},
    chargeable = false,
): readonly AttackPhase[] => {
    const total = windup + attack
    return [
        {
            name: 'windup', durationRatio: windup / total, moveSpeedMultiplier: moveSpeed.action, cancellable: false,
            ...(chargeable ? {chargeable: true, chargeMoveSpeedMultiplier: MELEE_CHARGE_MOVE_SPEED_MULTIPLIER} : {}),
        },
        {name: 'strike', durationRatio: attack / total, moveSpeedMultiplier: moveSpeed.action, cancellable: false},
        {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: moveSpeed.recovery, cancellable: false},
    ]
}

/** 地面段阶段：动作 0.3 / 后摇 0.35 */
const groundSegmentPhases = (windup: number, attack: number, chargeable = false): readonly AttackPhase[] =>
    segmentPhases(windup, attack, {action: MELEE_ACTION_MOVE_SPEED, recovery: MELEE_RECOVERY_MOVE_SPEED}, chargeable)

/** 空中段阶段：与地面同结构但全程 0.5 移速；空中段不可蓄力。 */
const airSegmentPhases = (): readonly AttackPhase[] =>
    segmentPhases(MELEE_AIR_WINDUP, MELEE_AIR_ATTACK, {action: MELEE_AIR_MOVE_SPEED, recovery: MELEE_AIR_MOVE_SPEED})

/** 段 id：`{classId}_{holdMode}_{模板键}`（与武器类 + 持握模式一一对应，同时是动画键与骨骼动画数据键） */
export const meleeSegmentId = (classId: string, holdMode: HoldMode, segmentKey: MeleeSegmentKey): string =>
    `${classId}_${holdMode}_${segmentKey}`

/** 空中段 id：`{classId}_{holdMode}_{air_N}`（命名空间与地面段分离） */
export const meleeAirSegmentId = (classId: string, holdMode: HoldMode, airKey: MeleeAirSegmentKey): string =>
    `${classId}_${holdMode}_${airKey}`

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
 * 段数/动量/操控由武器种类决定（段数可与地面不同）；自身冲击由段的 `impulses` 配置。
 * 空中段动画是自烘焙 clip，`poseKeys` 仅作 clip 数据的姿势基底说明。
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
    /** 每段动画的**姿势基底**地面段模板键（与 `steps` 一一对应；仅用于生成空中段自己的 clip 数据） */
    readonly poseKeys: readonly MeleeSegmentKey[]
}

/** 默认空中攻击模组：单段、保留惯性、低操控、姿势基底取轻击 1 段 */
export const DEFAULT_MELEE_AIR_ATTACK: MeleeAirAttackConfig = {
    steps: ['air_1'], loop: false, momentum: 0.98, airControl: 0.35, poseKeys: ['light_1'],
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
    /** 逐段自身冲击序列（键 = 模板键，地面与空中段共用命名空间；缺省 = 无冲击） */
    readonly impulses?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, readonly AttackImpulse[]>>
    /** 逐段冲击力 / 削韧覆写（键 = 模板键，地面与空中段共用命名空间） */
    readonly impact?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, SegmentImpactOverride>>
    /** 逐段命中挂点（天然武器多肢体；键 = 模板键，地面/空中共用） */
    readonly hitMounts?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, readonly string[]>>
    /** 逐段实际攻击武器 id（吐息等非主武器段） */
    readonly attackWeaponIds?: Partial<Record<MeleeSegmentKey | MeleeAirSegmentKey, string>>
    /**
     * pose 引用重映射（空手 / 天然武器复用既有段动画，避免为每类武器重复烘焙关键帧）：
     * 入参为本武器自己的段 id，返回实际 clip id（缺省 = 恒等，指向本段自烘焙关键帧）。
     */
    readonly poseRef?: (ownPoseId: string) => string
    /**
     * 重击蓄力配置：提供后，本模式的重击段声明为可蓄力（`chargeFullTime` + windup `chargeable`），
     * 按住攻击键即冻结在重击抬手起始帧蓄力、松开从已蓄力进度续播挥斩；伤害按蓄力值连续缩放，蓄力值 > 0 时挂冷却。
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
    const poseRef = options.poseRef ?? ((ownPoseId: string): string => ownPoseId)

    const make = (segmentKey: MeleeSegmentKey): AttackSegment => {
        const meta = SEGMENT_META[segmentKey]
        const heavy = meta.heavy
        const id = meleeSegmentId(classId, holdMode, segmentKey)
        const impactOverride = options.impact?.[segmentKey]
        const base: AttackSegment = {
            id,
            key: meta.key,
            step: meta.step,
            duration: heavy ? MELEE_HEAVY_DURATION : MELEE_LIGHT_DURATION,
            recovery: heavy ? MELEE_HEAVY_RECOVERY : MELEE_LIGHT_RECOVERY,
            /* 重击段可蓄力：按住攻击键冻结在 windup 起始帧蓄力，松开从已蓄力进度继续抬手并挥出 */
            phases: groundSegmentPhases(
                heavy ? MELEE_HEAVY_WINDUP : MELEE_LIGHT_WINDUP,
                heavy ? MELEE_HEAVY_ATTACK : MELEE_LIGHT_ATTACK,
                heavy && heavyCharge !== undefined,
            ),
            /* 动作组合：默认单层（段 id 即 pose 资产 id），可继续追加分层 pose 与权重 */
            poseId: poseRef(id),
            damageMultiplier: heavy ? MELEE_HEAVY_DAMAGE_MULTIPLIER : 1,
            impact: impactOverride?.impact ?? (heavy ? MELEE_HEAVY_IMPACT : MELEE_LIGHT_IMPACT),
            poiseDamage: impactOverride?.poiseDamage ?? (heavy ? MELEE_HEAVY_POISE_DAMAGE : MELEE_LIGHT_POISE_DAMAGE),
            ...(options.impulses?.[segmentKey] !== undefined ? {impulses: options.impulses[segmentKey]} : {}),
            ...(options.hitMounts?.[segmentKey] !== undefined ? {hitMountJointIds: options.hitMounts[segmentKey]} : {}),
            ...(options.attackWeaponIds?.[segmentKey] !== undefined ? {attackWeaponId: options.attackWeaponIds[segmentKey]} : {}),
            cooldown: 0,
            next: transitionsFor(classId, holdMode, chains[meta.key], segmentKey),
        }
        if (!heavy || heavyCharge === undefined) return base
        return {
            ...base,
            /* 满蓄力 = 抬手段末（缓慢完成整段前摇）：有效蓄力时长取下限，与单武器 / 面板覆写路径同一规则 */
            chargeFullTime: effectiveChargeFullTime(base, heavyCharge.maxChargeTime),
            chargeDamageBonus: chargeDamageBonusOf(heavyCharge),
            chargeCooldown: heavyCharge.cooldown,
        }
    }

    const segments: Record<string, AttackSegment> = {}
    for (const segmentKey of usedKeys) {
        const segment = make(segmentKey)
        segments[segment.id] = segment
    }

    /* 空中段：独立命名空间 + 自烘焙 clip（`poseId` 默认指向段自身，运行时不再引用地面 pose）；
     * poseKeys 必须与 steps 一一对应且指向本模式实际生成的地面段（= 该空中段 clip 的姿势基底出处，fail loudly） */
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
        const impactOverride = options.impact?.[_step]
        segments[id] = {
            id,
            key: 'air',
            step: index + 1,
            duration: MELEE_AIR_DURATION,
            recovery: MELEE_AIR_RECOVERY,
            phases: airSegmentPhases(),
            poseId: id,
            damageMultiplier: MELEE_AIR_DAMAGE_MULTIPLIER,
            impact: impactOverride?.impact ?? MELEE_AIR_IMPACT,
            poiseDamage: impactOverride?.poiseDamage ?? MELEE_AIR_POISE_DAMAGE,
            ...(options.impulses?.[_step] !== undefined ? {impulses: options.impulses[_step]} : {}),
            ...(options.hitMounts?.[_step] !== undefined ? {hitMountJointIds: options.hitMounts[_step]} : {}),
            ...(options.attackWeaponIds?.[_step] !== undefined ? {attackWeaponId: options.attackWeaponIds[_step]} : {}),
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
