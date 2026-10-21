import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../character/weapon/melee_weapon.ts'

/**
 * 马武器表（formId = 'horse'）：唯一天然武器「铁蹄」。
 * - 轻 1 前踢（双前蹄），轻 2 后踹（双后蹄）；
 * - 重击蓄力践踏（双前蹄高举后砸下）。
 * 铁蹄外观由体形部件常驻表现，武器本身无可视网格。
 */

const FORM_ID = 'horse'

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    horse_iron_hoof: meleeClass({
        id: 'horse_iron_hoof', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 5, knockbackForce: 8, knockbackY: 2, detectionRange: 6,
        mountJointId: 'flFoot',
        detectBox: { size: { x: 0.7, y: 0.8, z: 1.0 }, offset: { x: 0, y: 0, z: 0.45 } },
    }, {
        one_handed: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['flFoot', 'frFoot'],
                light_2: ['rlFoot', 'rrFoot'],
                heavy_1: ['flFoot', 'frFoot'],
                air_1: ['flFoot', 'frFoot'],
            },
            impact: {
                light_1: {impact: 'medium', poiseDamage: 2},
                light_2: {impact: 'heavy', poiseDamage: 3},
                heavy_1: {impact: 'knockdown', poiseDamage: 6},
            },
        },
    }),
}

const MODELS: Record<string, WeaponModelConfig> = {
    horse_iron_hoof: {
        id: 'horse_iron_hoof', classId: 'horse_iron_hoof', formId: FORM_ID, name: '铁蹄', nameKey: 'weapon.horse_iron_hoof',
        mesh: { id: 'none' },
    },
}

/** 马全部武器 */
export const HORSE_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
