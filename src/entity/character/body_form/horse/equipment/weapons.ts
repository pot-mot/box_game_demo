import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 马武器表（formId = 'horse'）：唯一天然武器「铁蹄」。
 * - 轻 1 前踢（双前蹄），轻 2 后踹（双后蹄）；
 * - 重击蓄力践踏（双前蹄高举后砸下）。
 * 铁蹄外观由体形部件常驻表现，武器本身无可视网格。
 */

const FORM_ID = 'horse'

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    horse_head_blade: meleeClass({
        id: 'horse_head_blade', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 4, knockbackForce: 4, knockbackY: 1, detectionRange: 7,
        mountJointId: 'mouthMount', mountRotation: [Math.PI / 2, Math.PI / 2, 0],
        detectBox: { size: { x: 0.8, y: 0.7, z: 0.9 }, offset: { x: 0, y: 0, z: 0.4 } },
    }, {
        one_handed: {
            chains: {
                light: {steps: ['light_1', 'light_2', 'light_3'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['mouthMount'], light_2: ['mouthMount'], light_3: ['mouthMount'],
                heavy_1: ['mouthMount'], air_1: ['mouthMount'],
            },
        },
    }),
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
    horse_head_blade: {
        id: 'horse_head_blade', classId: 'horse_head_blade', formId: FORM_ID, name: '衔刃', nameKey: 'weapon.horse_head_blade',
        equipBodyParts: ['head'],
        mesh: { id: 'sword', bladeLen: 0.5, color: 0x8a8f98, gripColor: 0x4a3520 },
    },
    horse_iron_hoof: {
        id: 'horse_iron_hoof', classId: 'horse_iron_hoof', formId: FORM_ID, name: '铁蹄', nameKey: 'weapon.horse_iron_hoof',
        equipBodyParts: ['hooves'],
        mesh: { id: 'none' },
    },
}

/** 马全部武器 */
export const HORSE_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
