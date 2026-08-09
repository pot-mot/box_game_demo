import type { RangedWeaponConfig } from '../weapon/ranged_weapon.ts'
import { RANGED_WEAPON_PRESETS } from '../weapon/ranged_weapon.ts'
import type { AttackPhase } from './attack_phases.ts'
import { RANGED_PHASE_PRESETS } from './attack_phases.ts'

/** 远程技能配置 — 动作层参数 + 武器引用 */
export interface RangedSkillConfig {
    readonly id: string
    readonly type: 'ranged'
    readonly cooldown: number
    readonly duration: number
    readonly weapon: RangedWeaponConfig
    /** 攻击阶段序列（undefined = 使用默认单阶段） */
    readonly phases?: readonly AttackPhase[]
}

export const RANGED_SKILL_PRESETS: Record<string, RangedSkillConfig> = {
    longbow_shot: {
        id: 'longbow_shot',
        type: 'ranged',
        cooldown: 0.8,
        duration: 0.2,
        weapon: RANGED_WEAPON_PRESETS.longbow,
        phases: RANGED_PHASE_PRESETS.longbow_shot,
    },
    crossbow_bolt: {
        id: 'crossbow_bolt',
        type: 'ranged',
        cooldown: 1.2,
        duration: 0.15,
        weapon: RANGED_WEAPON_PRESETS.crossbow,
        phases: RANGED_PHASE_PRESETS.crossbow_bolt,
    },
    shotgun_blast: {
        id: 'shotgun_blast',
        type: 'ranged',
        cooldown: 1.0,
        duration: 0.3,
        weapon: RANGED_WEAPON_PRESETS.shotgun,
        phases: RANGED_PHASE_PRESETS.shotgun_blast,
    },
    staff_orb: {
        id: 'staff_orb',
        type: 'ranged',
        cooldown: 1.0,
        duration: 0.3,
        weapon: RANGED_WEAPON_PRESETS.staff,
        phases: RANGED_PHASE_PRESETS.staff_orb,
    },
    magic_wand_homing: {
        id: 'magic_wand_homing',
        type: 'ranged',
        cooldown: 0.6,
        duration: 0.15,
        weapon: RANGED_WEAPON_PRESETS.magic_wand,
        phases: RANGED_PHASE_PRESETS.magic_wand_homing,
    },
    throwing_axe_hurl: {
        id: 'throwing_axe_hurl',
        type: 'ranged',
        cooldown: 0.9,
        duration: 0.25,
        weapon: RANGED_WEAPON_PRESETS.throwing_axe,
        phases: RANGED_PHASE_PRESETS.throwing_axe_hurl,
    },
    grenade_throw: {
        id: 'grenade_throw',
        type: 'ranged',
        cooldown: 2.0,
        duration: 0.4,
        weapon: RANGED_WEAPON_PRESETS.grenade,
        phases: RANGED_PHASE_PRESETS.grenade_throw,
    },
    molotov_throw: {
        id: 'molotov_throw',
        type: 'ranged',
        cooldown: 1.8,
        duration: 0.4,
        weapon: RANGED_WEAPON_PRESETS.molotov,
        phases: RANGED_PHASE_PRESETS.molotov_throw,
    },
    throwing_dart_fling: {
        id: 'throwing_dart_fling',
        type: 'ranged',
        cooldown: 0.2,
        duration: 0.1,
        weapon: RANGED_WEAPON_PRESETS.throwing_dart,
        phases: RANGED_PHASE_PRESETS.throwing_dart_fling,
    },
}
