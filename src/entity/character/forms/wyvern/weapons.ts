import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../character/weapon/melee_weapon.ts'
import {rangedClass, resolveRangedWeapon, type RangedWeaponClassConfig} from '../../../../character/weapon/ranged_weapon.ts'

/**
 * 双足飞龙武器表（formId = 'wyvern'）：天然爪击（近战）+ 吐息（远程锥形）。
 * 两者均无可视模型（`mesh: none`），动作由 wyvern 体形分包提供。
 */

const FORM_ID = 'wyvern'

const MELEE_CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wyvern_claw: meleeClass({
        id: 'wyvern_claw', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 3, knockbackForce: 4, knockbackY: 1, detectionRange: 6,
        /* 命中盒挂翼爪专属挂点（前下方），与翼展前扑爪击姿态一致 */
        mountJointId: 'clawMount',
        detectBox: { size: { x: 0.7, y: 0.8, z: 0.8 }, offset: { x: 0, y: 0, z: 0.4 } },
    }, { one_handed: {} }),
}

const MELEE_MODELS: Record<string, WeaponModelConfig> = {
    wyvern_claw: {
        id: 'wyvern_claw', classId: 'wyvern_claw', formId: FORM_ID, name: '爪击', nameKey: 'weapon.wyvern_claw',
        mesh: { id: 'none' },
    },
}

const RANGED_CLASSES: Record<string, RangedWeaponClassConfig> = {
    /* 天然吐息（锥形散射 + 小范围爆散） */
    wyvern_breath: rangedClass({
        id: 'wyvern_breath', type: 'ranged', natural: true,
        damageType: 'magic',
        holdModes: ['one_handed'],
        damage: 3, range: 7,
        knockbackForce: 3, projectileSpeed: 13, projectileLifetime: 1.2,
        detectionRange: 14, idealRange: 5, retreatRange: 3,
        spreadCount: 5, spreadAngle: Math.PI * 0.12, explosionRadius: 0.9,
        projectile: {kind: 'magic_orb', explosionStyle: 'magic'}, projectileGravityScale: 0.02,
    }),
}

const RANGED_MODELS: Record<string, WeaponModelConfig> = {
    wyvern_breath: {
        id: 'wyvern_breath', classId: 'wyvern_breath', formId: FORM_ID, name: '吐息', nameKey: 'weapon.wyvern_breath',
        mesh: { id: 'none' },
    },
}

/** wyvern 全部武器（爪击在前、吐息在后） */
export const WYVERN_WEAPONS: readonly WeaponConfig[] = [
    ...Object.values(MELEE_MODELS).map(model => resolveMeleeWeapon(MELEE_CLASSES[model.classId]!, model)),
    ...Object.values(RANGED_MODELS).map(model => resolveRangedWeapon(RANGED_CLASSES[model.classId]!, model)),
]
