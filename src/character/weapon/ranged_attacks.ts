import type {AttackPhase} from '../combat/attack_phases.ts'
import type {AttackSegment, WeaponAttacks} from './attack_chain.ts'

/**
 * 远程武器攻击段（武器模组固有数据）：
 * 每把远程武器拥有 1 个主干段（轻击键触发），只声明**玩法时序**（阶段名/时长/移速/可中断）；
 * 动画是段 id 对应的显式骨骼关键帧（`character/weapon/attack_clip_data.ts`），不再有动画参数。
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
        duration: 0.2,
        cooldown: 0,
        phases: [
            {name: 'draw', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false},
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true},
            {name: 'release', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    crossbow: {
        segmentId: 'crossbow_bolt',
        duration: 0.15,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    shotgun: {
        segmentId: 'shotgun_blast',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.2, cancellable: false},
        ],
    },
    staff: {
        segmentId: 'staff_orb',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: true},
            {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    magic_wand: {
        segmentId: 'magic_wand_homing',
        duration: 0.15,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: true},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.4, cancellable: false},
        ],
    },
    throwing_axe: {
        segmentId: 'throwing_axe_hurl',
        duration: 0.25,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: false},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    grenade: {
        segmentId: 'grenade_throw',
        duration: 0.4,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    molotov: {
        segmentId: 'molotov_throw',
        duration: 0.4,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false},
        ],
    },
    throwing_dart: {
        segmentId: 'throwing_dart_fling',
        duration: 0.1,
        cooldown: 0,
        phases: [
            {name: 'release', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false},
        ],
    },
}

/** 远程武器段 id（缺省 = `{weaponId}_shot`） */
export const rangedSegmentIdOf = (weaponId: string): string =>
    RANGED_ATTACK_SPECS[weaponId]?.segmentId ?? `${weaponId}_shot`

/**
 * 构建远程武器攻击链（单段 = 一次开火动作）：
 * 轻击键 → 该段起手；段无 next（单发，无连段），冷却为 0（节奏由动作时间自然形成）。
 */
export const buildRangedAttacks = (weaponId: string): WeaponAttacks => {
    const spec = RANGED_ATTACK_SPECS[weaponId]
    if (spec === undefined) {
        throw new Error(`远程武器攻击段未定义：${weaponId}`)
    }
    const segment: AttackSegment = {
        id: spec.segmentId,
        key: 'light',
        step: 1,
        duration: spec.duration,
        recovery: 0,
        phases: spec.phases,
        /* 动作组合：默认单层（段 id 即 pose 资产 id） */
        poses: [{poseId: spec.segmentId, weight: 1}],
        damageMultiplier: 1,
        cooldown: spec.cooldown,
        next: [],
    }
    return {
        segments: {[segment.id]: segment},
        chains: {
            light: {key: 'light', entries: [{segmentId: segment.id}], steps: [segment.id]},
            /* 远程武器无重击链（空链：起手解析恒失败） */
            heavy: {key: 'heavy', entries: [], steps: []},
        },
    }
}
