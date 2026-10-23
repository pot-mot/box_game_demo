import type {BreathModuleConfig} from '../../../../../character/weapon/breath_module.ts'
import {rangedClass, resolveRangedWeapon} from '../../../../../character/weapon/ranged_weapon.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'

/**
 * 龙吐息模组（独立 `breath` 装备槽；仅 wyvern 可装备）。
 * 三者共享重击时序与蓄力，机制分别是：火球爆炸 / 雷电链式 / 激光持续光束。
 */

const FORM_ID = 'wyvern'

interface BreathSpec {
    readonly id: string
    readonly itemId: string
    readonly name: string
    readonly nameKey: BreathModuleConfig['nameKey']
    readonly damage: number
    readonly range: number
    readonly projectileSpeed: number
    readonly projectileLifetime: number
    readonly projectile: BreathModuleConfig['projectile']
    readonly explosionRadius?: number
    readonly chainCount?: number
    readonly chainRadius?: number
    readonly chainFalloff?: number
    readonly pierceCount?: number
}

const SPECS: readonly BreathSpec[] = [
    {
        id: 'breath_fireball', itemId: 'item_breath_fireball', name: '火球吐息', nameKey: 'breath.fireball',
        damage: 8, range: 12, projectileSpeed: 14, projectileLifetime: 3.2,
        projectile: {kind: 'magic_orb', color: 0xff7a2a, explosionStyle: 'fire'},
        explosionRadius: 1.8,
    },
    {
        id: 'breath_lightning', itemId: 'item_breath_lightning', name: '雷电吐息', nameKey: 'breath.lightning',
        damage: 7, range: 14, projectileSpeed: 34, projectileLifetime: 1.1,
        projectile: {kind: 'lightning', color: 0x8fc8ff},
        chainCount: 3, chainRadius: 3.2, chainFalloff: 0.65,
    },
    {
        id: 'breath_laser', itemId: 'item_breath_laser', name: '激光吐息', nameKey: 'breath.laser',
        /* 激光 = 高速穿透弹体（pierceCount 决定贯穿人数）；生命期按射程 / 初速推导，避免超出 13m 射程 */
        damage: 9, range: 13, projectileSpeed: 62, projectileLifetime: 13 / 62,
        projectile: {kind: 'laser', color: 0xff5f8d},
        pierceCount: 4,
    },
]

const build = (spec: BreathSpec): BreathModuleConfig => {
    const kind: BreathModuleConfig['breathKind'] = spec.id === 'breath_fireball'
        ? 'fireball'
        : spec.id === 'breath_lightning' ? 'lightning' : 'laser'
    const base = rangedClass({
        id: spec.id, type: 'ranged', natural: true, damageType: 'magic', holdModes: ['one_handed'],
        damage: spec.damage,
        range: spec.range,
        knockbackForce: spec.chainCount !== undefined ? 2 : 4,
        projectileSpeed: spec.projectileSpeed,
        projectileLifetime: spec.projectileLifetime,
        detectionRange: 14, idealRange: 7, retreatRange: 4,
        projectile: spec.projectile, projectileGravityScale: spec.id === 'breath_fireball' ? 0.18 : 0,
        mountJointId: 'mouthMount',
        breathKind: kind,
        ...(spec.explosionRadius !== undefined ? {explosionRadius: spec.explosionRadius} : {}),
        ...(spec.chainCount !== undefined ? {chainCount: spec.chainCount} : {}),
        ...(spec.chainRadius !== undefined ? {chainRadius: spec.chainRadius} : {}),
        ...(spec.chainFalloff !== undefined ? {chainFalloff: spec.chainFalloff} : {}),
        ...(spec.pierceCount !== undefined ? {pierceCount: spec.pierceCount} : {}),
        charge: {
            maxChargeMultiplier: spec.id === 'breath_laser' ? 180 : 220,
            maxChargeTime: 1.05,
            minSpeedScale: spec.id === 'breath_fireball' ? 0.7 : 1,
            maxSpeedScale: spec.id === 'breath_fireball' ? 1.5 : 1,
            minLifetimeScale: 0.85, maxLifetimeScale: 1.25,
        },
    }, 'heavy')
    const model: WeaponModelConfig = {
        id: spec.id, classId: spec.id, formId: FORM_ID, name: spec.name, nameKey: spec.nameKey,
        equipBodyParts: ['breath'],
        mesh: {id: 'none'},
    }
    const resolved = resolveRangedWeapon(base, model)
    return {...resolved, breathKind: kind, itemId: spec.itemId}
}

export const WYVERN_BREATH_MODULES: readonly BreathModuleConfig[] = SPECS.map(build)
