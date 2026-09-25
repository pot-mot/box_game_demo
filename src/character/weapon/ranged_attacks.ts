import type {AttackPhase} from '../combat/attack_phases.ts'
import {DEFAULT_ANIM} from '../combat/attack_phases.ts'
import type {AttackSegment, WeaponAttacks} from './attack_chain.ts'

/**
 * 远程武器攻击段（武器模组固有数据）：
 * 每把远程武器拥有 1 个主干段（轻击键触发），动画阶段（draw / aim / release 等）与时长在此声明；
 * 段 id 沿用原技能 id（如 `longbow_shot`），作为动画键与清单键。
 */

interface RangedAttackSpec {
    /** 段 id（= 原远程技能 id，动画键与清单键） */
    readonly segmentId: string
    /** 动作时长（秒，不含恢复段） */
    readonly duration: number
    /** 阶段序列（draw / aim / release …） */
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
            {name: 'draw', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.15, twoHanded: true}},
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.15, twoHanded: true}},
            {name: 'release', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: -1.35, elbowBend: 0.1, twoHanded: true}},
        ],
    },
    crossbow: {
        segmentId: 'crossbow_bolt',
        duration: 0.15,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.1, twoHanded: true}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: -1.4, elbowBend: 0.08, twoHanded: true}},
        ],
    },
    shotgun: {
        segmentId: 'shotgun_blast',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, elbowBend: 0.5, twoHanded: true}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.2, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingForwardX: -1.3, elbowBend: 0.45, bodyLean: -0.1, twoHanded: true}},
        ],
    },
    staff: {
        segmentId: 'staff_orb',
        duration: 0.3,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingBackZ: 0, elbowBend: 0.1, twoHanded: true}},
            {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingForwardX: -1.3, elbowBend: 0.08, twoHanded: true}},
        ],
    },
    magic_wand: {
        segmentId: 'magic_wand_homing',
        duration: 0.15,
        cooldown: 0,
        phases: [
            {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, elbowBend: 0.1}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingForwardX: -1.1, elbowBend: 0.08}},
        ],
    },
    throwing_axe: {
        segmentId: 'throwing_axe_hurl',
        duration: 0.25,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
        ],
    },
    grenade: {
        segmentId: 'grenade_throw',
        duration: 0.4,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
        ],
    },
    molotov: {
        segmentId: 'molotov_throw',
        duration: 0.4,
        cooldown: 0,
        phases: [
            {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
            {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
        ],
    },
    throwing_dart: {
        segmentId: 'throwing_dart_fling',
        duration: 0.1,
        cooldown: 0,
        phases: [
            {name: 'release', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.9, armSwingForwardX: 0.6, elbowBend: 0.1}},
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
