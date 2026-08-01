import type { MeleeWeaponConfig } from '../weapon/melee_weapon.ts'
import { MELEE_WEAPON_PRESETS } from '../weapon/melee_weapon.ts'

/** 近战技能配置 — 动作层参数 + 武器引用 */
export interface MeleeSkillConfig {
    readonly id: string
    readonly type: 'melee'
    readonly cooldown: number
    readonly duration: number
    readonly weapon: MeleeWeaponConfig
}

export const MELEE_SKILL_PRESETS: Record<string, MeleeSkillConfig> = {
    short_sword_slash: {
        id: 'short_sword_slash',
        type: 'melee',
        cooldown: 0.25,
        duration: 0.15,
        weapon: MELEE_WEAPON_PRESETS.short_sword,
    },
    long_sword_slash: {
        id: 'long_sword_slash',
        type: 'melee',
        cooldown: 0.5,
        duration: 0.3,
        weapon: MELEE_WEAPON_PRESETS.long_sword,
    },
    heavy_sword_slam: {
        id: 'heavy_sword_slam',
        type: 'melee',
        cooldown: 1.2,
        duration: 0.5,
        weapon: MELEE_WEAPON_PRESETS.heavy_sword,
    },
    spear_thrust: {
        id: 'spear_thrust',
        type: 'melee',
        cooldown: 0.7,
        duration: 0.35,
        weapon: MELEE_WEAPON_PRESETS.spear,
    },
    dual_axe_spin: {
        id: 'dual_axe_spin',
        type: 'melee',
        cooldown: 0.6,
        duration: 0.4,
        weapon: MELEE_WEAPON_PRESETS.dual_axe,
    },
    war_hammer_smash: {
        id: 'war_hammer_smash',
        type: 'melee',
        cooldown: 1.5,
        duration: 0.6,
        weapon: MELEE_WEAPON_PRESETS.war_hammer,
    },
}
