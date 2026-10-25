import type {AttackPhase} from '../combat/attack_phases.ts'
import type {ImpactLevel} from '../combat/impact.ts'
import type {AttackSegment, WeaponAttacks} from './attack_chain.ts'
import type {AttackModuleId} from './attack_module.ts'
import type {ChargeTuning} from './charge_tuning.ts'

/** 远程武器默认冲击力（弹丸命中：弱硬直，不打断攻击） */
export const RANGED_DEFAULT_IMPACT: ImpactLevel = 'medium'
/** 远程武器默认削韧值 */
export const RANGED_DEFAULT_POISE_DAMAGE = 2

/** 远程攻击动作整体速度 = 原速度的 25%（时长 ×4） */
export const RANGED_ANIMATION_SPEED_SCALE = 0.25
/** 远程攻击动作三段时间比例：前摇 / 释放 / 后摇 = 2 : 1 : 2.5 */
export const RANGED_PHASE_RATIO = {windup: 2, release: 1, recovery: 2.5} as const

/**
 * 远程武器攻击段（武器模组固有数据）：
 * 每把远程武器拥有 1 个主干段（轻击键触发），只声明基础动作时长与是否可蓄力；
 * 阶段时序统一由 `RANGED_PHASE_RATIO` 生成（2:1:2.5），动画是段 id 对应的显式骨骼关键帧。
 * 远程动作整体速度取 `RANGED_ANIMATION_SPEED_SCALE`（当前 25%，即时长 ×4）。
 */
interface RangedAttackSpec {
    /** 段 id（= 原远程技能 id，动画键与清单键、骨骼动画数据键） */
    readonly segmentId: string
    /** 基础动作时长（秒；实际时长 = duration / RANGED_ANIMATION_SPEED_SCALE） */
    readonly duration: number
    /** 冷却（秒，0 = 无冷却） */
    readonly cooldown: number
    /** 前摇是否可蓄力（按住冻结在蓄力锚点） */
    readonly chargeable?: boolean
    /** 相对当前远程节奏的速度倍率（1 = 不变；1.5 = 提速到当前 150%） */
    readonly speedMultiplier?: number
}

const RANGED_ATTACK_SPECS: Record<string, RangedAttackSpec> = {
    longbow: {segmentId: 'longbow_shot', duration: 0.4, cooldown: 0, chargeable: true},
    crossbow: {segmentId: 'crossbow_bolt', duration: 0.3, cooldown: 0},
    shotgun: {segmentId: 'shotgun_blast', duration: 0.6, cooldown: 0},
    staff: {segmentId: 'staff_orb', duration: 0.6, cooldown: 0},
    magic_wand: {segmentId: 'magic_wand_homing', duration: 0.3, cooldown: 0},
    throwing_axe: {segmentId: 'throwing_axe_hurl', duration: 0.5, cooldown: 0, chargeable: true, speedMultiplier: 1.5},
    grenade: {segmentId: 'grenade_throw', duration: 0.8, cooldown: 0, chargeable: true, speedMultiplier: 1.5},
    molotov: {segmentId: 'molotov_throw', duration: 0.8, cooldown: 0, chargeable: true, speedMultiplier: 1.5},
    throwing_dart: {segmentId: 'throwing_dart_fling', duration: 0.2, cooldown: 0, chargeable: true},
    /* 龙吐息（三种机制共用蓄力/释放时序） */
    breath_natural: {segmentId: 'breath_natural_blast', duration: 0.6, cooldown: 0, chargeable: true},
    breath_fireball: {segmentId: 'breath_fireball_blast', duration: 0.65, cooldown: 0, chargeable: true},
    breath_lightning: {segmentId: 'breath_lightning_blast', duration: 0.55, cooldown: 0, chargeable: true},
    breath_laser: {segmentId: 'breath_laser_beam', duration: 1.1, cooldown: 0, chargeable: true},
}

/** 远程武器段 id（缺省 = `{weaponId}_shot`） */
export const rangedSegmentIdOf = (weaponId: string): string =>
    RANGED_ATTACK_SPECS[weaponId]?.segmentId ?? `${weaponId}_shot`

/** 按 2:1:2.5 生成远程攻击阶段：前摇 / 释放计入 duration，后摇独立取 recovery */
const rangedPhases = (chargeable: boolean): readonly AttackPhase[] => [
    {
        name: 'draw',
        durationRatio: RANGED_PHASE_RATIO.windup / (RANGED_PHASE_RATIO.windup + RANGED_PHASE_RATIO.release),
        moveSpeedMultiplier: 0.25,
        cancellable: false,
        ...(chargeable ? {chargeable: true, chargeMoveSpeedMultiplier: 0.5} : {}),
    },
    {
        name: 'release',
        durationRatio: RANGED_PHASE_RATIO.release / (RANGED_PHASE_RATIO.windup + RANGED_PHASE_RATIO.release),
        moveSpeedMultiplier: 0.25,
        cancellable: false,
    },
    /* recovery 阶段时长取段 recovery（按 2.5 份比例换算），ratio 不参与动作时长分摊 */
    {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false},
]

/**
 * 构建远程武器攻击链（单段 = 一次开火动作）：
 * 轻击键 → 该段起手；段无 next（单发，无连段），冷却为 0（节奏由动作时间自然形成）。
 * `charge` 提供时该段声明 `chargeFullTime`（可蓄力）。
 */
export const buildRangedAttacks = (
    weaponId: string,
    moduleId: AttackModuleId,
    charge?: ChargeTuning,
    attackKey: 'light' | 'heavy' = 'light',
): WeaponAttacks => {
    const spec = RANGED_ATTACK_SPECS[weaponId]
    if (spec === undefined) {
        throw new Error(`远程武器攻击段未定义：${weaponId}`)
    }
    /* 速度降到 25%（总时长 ×4），再按单武器速度倍率调整；最后按 2:1:2.5 拆分动作 / 后摇 */
    const total = spec.duration / (RANGED_ANIMATION_SPEED_SCALE * (spec.speedMultiplier ?? 1))
    const actionUnits = RANGED_PHASE_RATIO.windup + RANGED_PHASE_RATIO.release
    const duration = total * actionUnits / (actionUnits + RANGED_PHASE_RATIO.recovery)
    const recovery = total * RANGED_PHASE_RATIO.recovery / (actionUnits + RANGED_PHASE_RATIO.recovery)
    const segment: AttackSegment = {
        id: spec.segmentId,
        moduleId,
        key: attackKey,
        step: 1,
        duration,
        recovery,
        phases: rangedPhases(spec.chargeable === true),
        /* 动作组合：默认单层（段 id 即 pose 资产 id） */
        poseId: spec.segmentId,
        damageMultiplier: 1,
        impact: RANGED_DEFAULT_IMPACT,
        poiseDamage: RANGED_DEFAULT_POISE_DAMAGE,
        cooldown: spec.cooldown,
        ...(charge !== undefined ? {chargeFullTime: charge.maxChargeTime} : {}),
        next: [],
    }
    const activeChain = {key: attackKey, entries: [{segmentId: segment.id}], steps: [segment.id]}
    return {
        segments: {[segment.id]: segment},
        chains: {
            light: attackKey === 'light' ? activeChain : {key: 'light', entries: [], steps: []},
            heavy: attackKey === 'heavy' ? activeChain : {key: 'heavy', entries: [], steps: []},
            /* 远程武器无空中攻击链（空链：跳跃中按攻击键不起手） */
            air: {key: 'air', entries: [], steps: []},
        },
    }
}
