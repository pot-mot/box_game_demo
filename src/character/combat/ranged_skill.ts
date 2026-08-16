import type { RangedWeaponConfig } from '../weapon/ranged_weapon.ts'
import { RANGED_WEAPON_PRESETS } from '../weapon/ranged_weapon.ts'
import type { AttackPhase } from './attack_phases.ts'
import { RANGED_PHASE_PRESETS } from './attack_phases.ts'

/** 远程技能配置 — 动作层参数 + 武器引用 */
export interface RangedSkillConfig {
    readonly id: string
    readonly type: 'ranged'
    /** 冷却时间（秒）— 普通攻击为 0；非 0 时从触发时刻开始计时，只挡起手 */
    readonly cooldown: number
    /** 动作时间（秒）— 动作阶段（draw/aim/release 等，不含恢复）的总时长 */
    readonly duration: number
    /** 恢复时间（秒）— 动作结束后的后摇时长（0 = 无恢复段） */
    readonly recovery: number
    readonly weapon: RangedWeaponConfig
    /** 攻击阶段序列（undefined = 使用默认单阶段） */
    readonly phases?: readonly AttackPhase[]
}

export const RANGED_SKILL_PRESETS: Record<string, RangedSkillConfig> = {
    longbow_shot: {
        id: 'longbow_shot',
        type: 'ranged',
        cooldown: 0,
        duration: 0.2,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.longbow,
        phases: RANGED_PHASE_PRESETS.longbow_shot,
    },
    crossbow_bolt: {
        id: 'crossbow_bolt',
        type: 'ranged',
        cooldown: 0,
        duration: 0.15,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.crossbow,
        phases: RANGED_PHASE_PRESETS.crossbow_bolt,
    },
    shotgun_blast: {
        id: 'shotgun_blast',
        type: 'ranged',
        cooldown: 0,
        duration: 0.3,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.shotgun,
        phases: RANGED_PHASE_PRESETS.shotgun_blast,
    },
    staff_orb: {
        id: 'staff_orb',
        type: 'ranged',
        cooldown: 0,
        duration: 0.3,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.staff,
        phases: RANGED_PHASE_PRESETS.staff_orb,
    },
    magic_wand_homing: {
        id: 'magic_wand_homing',
        type: 'ranged',
        cooldown: 0,
        duration: 0.15,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.magic_wand,
        phases: RANGED_PHASE_PRESETS.magic_wand_homing,
    },
    throwing_axe_hurl: {
        id: 'throwing_axe_hurl',
        type: 'ranged',
        cooldown: 0,
        duration: 0.25,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.throwing_axe,
        phases: RANGED_PHASE_PRESETS.throwing_axe_hurl,
    },
    grenade_throw: {
        id: 'grenade_throw',
        type: 'ranged',
        cooldown: 0,
        duration: 0.4,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.grenade,
        phases: RANGED_PHASE_PRESETS.grenade_throw,
    },
    molotov_throw: {
        id: 'molotov_throw',
        type: 'ranged',
        cooldown: 0,
        duration: 0.4,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.molotov,
        phases: RANGED_PHASE_PRESETS.molotov_throw,
    },
    throwing_dart_fling: {
        id: 'throwing_dart_fling',
        type: 'ranged',
        cooldown: 0,
        duration: 0.1,
        recovery: 0,
        weapon: RANGED_WEAPON_PRESETS.throwing_dart,
        phases: RANGED_PHASE_PRESETS.throwing_dart_fling,
    },
}
