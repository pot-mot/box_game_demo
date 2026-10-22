import type {AttackPhase} from '../combat/attack_phases.ts'
import type {ImpactLevel} from '../combat/impact.ts'
import type {AttackSegment, WeaponAttacks} from './attack_chain.ts'
import type {ChargeTuning} from './charge_tuning.ts'

/** 远程武器默认冲击力（弹丸命中：弱硬直，不打断攻击） */
export const RANGED_DEFAULT_IMPACT: ImpactLevel = 'medium'
/** 远程武器默认削韧值 */
export const RANGED_DEFAULT_POISE_DAMAGE = 2

/**
 * 远程武器攻击段（武器模组固有数据）：
 * 每把远程武器拥有 1 个主干段（轻击键触发），只声明**玩法时序**（阶段名/时长/移速/可中断）；
 * 动画是段 id 对应的显式骨骼关键帧（`attack_clips/` 基础轨道 + `attack_clips/` 逐段修订），不再有抽象动画参数。
 * **是否可蓄力与蓄力时长由武器类的 `charge`（最大倍率/最长时间）决定**，本文件只提供攻击时序。
 */

interface RangedAttackSpec {
    /** 段 id（= 原远程技能 id，动画键与清单键、骨骼动画数据键） */
    readonly segmentId: string
    /** 动作时长（秒，不含恢复段） */
    readonly duration: number
    /** 阶段序列（draw / aim / release …，仅时序） */
    readonly phases: readonly AttackPhase[]
    /** 冷却（秒，0 = 无冷却） */
    readonly cooldown: number
}

const RANGED_ATTACK_SPECS: Record<string, RangedAttackSpec> = {
    longbow: {
        segmentId: 'longbow_shot',
        duration: 0.4,
        cooldown: 0,
        phases: [
            {name: 'draw', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false},
            /* 蓄力锚点：按住时冻结在拉弓末（aim 起始帧），松开才放箭 */
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, chargeable: true},
            {name: 'release', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    crossbow: {
        segmentId: 'crossbow_bolt',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    shotgun: {
        segmentId: 'shotgun_blast',
        duration: 0.6,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.2, cancellable: false},
        ],
    },
    staff: {
        segmentId: 'staff_orb',
        duration: 0.6,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: true},
            {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    magic_wand: {
        segmentId: 'magic_wand_homing',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.4, cancellable: false},
        ],
    },
    throwing_axe: {
        segmentId: 'throwing_axe_hurl',
        duration: 0.5,
        cooldown: 0,
        phases: [
            /* 蓄力锚点：按住时冻结在后引末，松开才甩出 */
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    grenade: {
        segmentId: 'grenade_throw',
        duration: 0.8,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    molotov: {
        segmentId: 'molotov_throw',
        duration: 0.8,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    throwing_dart: {
        segmentId: 'throwing_dart_fling',
        duration: 0.2,
        cooldown: 0,
        phases: [
            /* 单阶段：按住时冻结在甩出起始帧（不发射），松开才甩出 */
            {name: 'release', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false, chargeable: true},
        ],
    },
    /* 龙吐息（三种机制共用蓄力/释放时序） */
    breath_fireball: {
        segmentId: 'breath_fireball_blast',
        duration: 0.65,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.45, moveSpeedMultiplier: 0.2, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.55, moveSpeedMultiplier: 0.2, cancellable: false},
        ],
    },
    breath_lightning: {
        segmentId: 'breath_lightning_blast',
        duration: 0.55,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.2, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.2, cancellable: false},
        ],
    },
    breath_laser: {
        segmentId: 'breath_laser_beam',
        duration: 1.1,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.36, moveSpeedMultiplier: 0.2, cancellable: false, chargeable: true},
            {name: 'release', durationRatio: 0.64, moveSpeedMultiplier: 0.2, cancellable: false},
        ],
    },
}

/** 远程武器段 id（缺省 = `{weaponId}_shot`） */
export const rangedSegmentIdOf = (weaponId: string): string =>
    RANGED_ATTACK_SPECS[weaponId]?.segmentId ?? `${weaponId}_shot`

/**
 * 构建远程武器攻击链（单段 = 一次开火动作）：
 * 轻击键 → 该段起手；段无 next（单发，无连段），冷却为 0（节奏由动作时间自然形成）。
 * `charge` 提供时该段声明 `chargeFullTime`（可蓄力），时长取武器类的最长蓄力时间。
 */
export const buildRangedAttacks = (
    weaponId: string,
    charge?: ChargeTuning,
    attackKey: 'light' | 'heavy' = 'light',
): WeaponAttacks => {
    const spec = RANGED_ATTACK_SPECS[weaponId]
    if (spec === undefined) {
        throw new Error(`远程武器攻击段未定义：${weaponId}`)
    }
    const segment: AttackSegment = {
        id: spec.segmentId,
        key: attackKey,
        step: 1,
        duration: spec.duration,
        recovery: 0,
        phases: spec.phases,
        /* 动作组合：默认单层（段 id 即 pose 资产 id） */
        poses: [{poseId: spec.segmentId, weight: 1}],
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
