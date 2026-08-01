import type { RangedWeaponConfig } from '../weapon/ranged_weapon.ts'
import { RANGED_WEAPON_PRESETS } from '../weapon/ranged_weapon.ts'

/** 远程技能配置 — 动作层参数 + 武器引用 */
export interface RangedSkillConfig {
    readonly id: string
    readonly type: 'ranged'
    readonly cooldown: number
    readonly duration: number
    readonly weapon: RangedWeaponConfig
}

export const RANGED_SKILL_PRESETS: Record<string, RangedSkillConfig> = {
    longbow_shot: {
        id: 'longbow_shot',
        type: 'ranged',
        cooldown: 0.8,
        duration: 0.2,
        weapon: RANGED_WEAPON_PRESETS.longbow,
    },
    crossbow_bolt: {
        id: 'crossbow_bolt',
        type: 'ranged',
        cooldown: 1.2,
        duration: 0.15,
        weapon: RANGED_WEAPON_PRESETS.crossbow,
    },
    shotgun_blast: {
        id: 'shotgun_blast',
        type: 'ranged',
        cooldown: 1.0,
        duration: 0.3,
        weapon: RANGED_WEAPON_PRESETS.shotgun,
    },
    staff_orb: {
        id: 'staff_orb',
        type: 'ranged',
        cooldown: 1.0,
        duration: 0.3,
        weapon: RANGED_WEAPON_PRESETS.staff,
    },
    magic_wand_homing: {
        id: 'magic_wand_homing',
        type: 'ranged',
        cooldown: 0.6,
        duration: 0.15,
        weapon: RANGED_WEAPON_PRESETS.magic_wand,
    },
    throwing_axe_hurl: {
        id: 'throwing_axe_hurl',
        type: 'ranged',
        cooldown: 0.9,
        duration: 0.25,
        weapon: RANGED_WEAPON_PRESETS.throwing_axe,
    },
    grenade_throw: {
        id: 'grenade_throw',
        type: 'ranged',
        cooldown: 2.0,
        duration: 0.4,
        weapon: RANGED_WEAPON_PRESETS.grenade,
    },
    molotov_throw: {
        id: 'molotov_throw',
        type: 'ranged',
        cooldown: 1.8,
        duration: 0.4,
        weapon: RANGED_WEAPON_PRESETS.molotov,
    },
    throwing_dart_fling: {
        id: 'throwing_dart_fling',
        type: 'ranged',
        cooldown: 0.2,
        duration: 0.1,
        weapon: RANGED_WEAPON_PRESETS.throwing_dart,
    },
}
