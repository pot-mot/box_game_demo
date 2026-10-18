import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../character/weapon/melee_weapon.ts'
import {rangedClass, resolveRangedWeapon, type RangedWeaponClassConfig} from '../../../../character/weapon/ranged_weapon.ts'

/**
 * 马武器表（formId = 'horse'）：天然踢击 + 长枪 / 飞斧（复用 `spear` / `throwing_axe` 网格）。
 * 踢击检测箱朝前（配合 AI 正面进攻），动作由马体形分包提供。
 */

const FORM_ID = 'horse'

const MELEE_CLASSES: Record<string, MeleeWeaponClassConfig> = {
    horse_kick: meleeClass({
        id: 'horse_kick', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 5, knockbackForce: 8, knockbackY: 2, detectionRange: 6,
        /* 检测箱朝前（原后置 -0.4 使 AI 正面追击永不出招）；命中盒挂前蹄专属挂点 */
        mountJointId: 'kickMount',
        detectBox: { size: { x: 0.6, y: 0.7, z: 0.9 }, offset: { x: 0, y: 0, z: 0.45 } },
    }, { one_handed: {} }),
    horse_spear: meleeClass({
        id: 'horse_spear', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 5, knockbackForce: 4, knockbackY: 1, detectionRange: 10,
        detectBox: { size: { x: 0.5, y: 0.7, z: 1.486 }, offset: { x: 0, y: 0, z: 0.618 } },
    }, { one_handed: {} }),
}

const MELEE_MODELS: Record<string, WeaponModelConfig> = {
    horse_kick: {
        id: 'horse_kick', classId: 'horse_kick', formId: FORM_ID, name: '踢击', nameKey: 'weapon.horse_kick',
        mesh: { id: 'none' },
    },
    horse_spear: {
        id: 'horse_spear', classId: 'horse_spear', formId: FORM_ID, name: '长枪', nameKey: 'weapon.horse_spear',
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa },
    },
}

const RANGED_CLASSES: Record<string, RangedWeaponClassConfig> = {
    horse_throwing_axe: rangedClass({
        id: 'horse_throwing_axe', type: 'ranged',
        damageType: 'physical',
        holdModes: ['one_handed'],
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        projectile: {kind: 'thrown_weapon', spin: true}, projectileGravityScale: 0.45,
        charge: {maxChargeMultiplier: 140, maxChargeTime: 0.9, minSpeedScale: 0.45, maxSpeedScale: 1.7, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
}

const RANGED_MODELS: Record<string, WeaponModelConfig> = {
    horse_throwing_axe: {
        id: 'horse_throwing_axe', classId: 'horse_throwing_axe', formId: FORM_ID, name: '飞斧', nameKey: 'weapon.horse_throwing_axe',
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    },
}

/** 马全部武器（近战在前、远程在后） */
export const HORSE_WEAPONS: readonly WeaponConfig[] = [
    ...Object.values(MELEE_MODELS).map(model => resolveMeleeWeapon(MELEE_CLASSES[model.classId]!, model)),
    ...Object.values(RANGED_MODELS).map(model => resolveRangedWeapon(RANGED_CLASSES[model.classId]!, model)),
]
