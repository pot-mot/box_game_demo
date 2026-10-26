import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import type {WeaponAttackBoxSpec} from '../../../../../character/weapon/mesh_config.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 马武器表（formId = 'horse'）：唯一天然武器「铁蹄」。
 * - 轻 1 前踢（双前蹄），轻 2 后踹（双后蹄）；
 * - 重击蓄力践踏（双前蹄高举后砸下）。
 * 蹄甲的外观由体形装备部件常驻表现，武器本身无可视网格。
 */

const FORM_ID = 'horse'

const HOOF_BOX = (jointId: string): WeaponAttackBoxSpec => ({
    jointId,
    center: {x: 0, y: 0.2, z: 0},
    half: {x: 0.15, y: 0.15, z: 0.2},
    rotation: {x: 0, y: 0, z: 0},
    reach: 0.35,
})

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    horse_iron_hoof: meleeClass({
        id: 'horse_iron_hoof', type: 'melee', natural: true, damageType: 'physical',
        attackModules: [{id: 'hoof', nameKey: 'weapon.horse_iron_hoof'}],
        damage: 5, knockbackForce: 8, knockbackY: 2, detectionRange: 6,
        timeScale: 2,
        mountJointId: 'flFoot',
        detectBoxes: [{jointId: 'body', size: {x: 0.7, y: 0.8, z: 1.0}, offset: {x: 0, y: 0, z: 0.45}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        hoof: {
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
        equipBodyParts: ['hooves'],
        mesh: {id: 'none'},
        mounts: [
            {jointId: 'flFoot', mesh: {id: 'none'}},
            {jointId: 'frFoot', mesh: {id: 'none'}},
            {jointId: 'rlFoot', mesh: {id: 'none'}},
            {jointId: 'rrFoot', mesh: {id: 'none'}},
        ],
        attackBoxes: [HOOF_BOX('flFoot'), HOOF_BOX('frFoot'), HOOF_BOX('rlFoot'), HOOF_BOX('rrFoot')],
        colliders: [],
        hurtBoxes: [],
    },
}

/** 马全部武器 */
export const HORSE_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
