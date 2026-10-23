import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 双足飞龙武器表（formId = 'wyvern'）：固定天然爪击。
 * - 轻击五段：右翼爪 → 左翼爪 → 咬 → 甩尾 → 双爪猛抓；
 * - 重击由独立吐息装备槽提供，不在此武器表中。
 */

const FORM_ID = 'wyvern'

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wyvern_wing_blade: meleeClass({
        id: 'wyvern_wing_blade', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 4, knockbackForce: 5, knockbackY: 2, detectionRange: 7,
        mountJointId: 'wingRWrist',
        detectBox: { size: { x: 0.9, y: 0.8, z: 0.9 }, offset: { x: 0, y: 0, z: 0.4 } },
    }, {
        one_handed: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'], light_2: ['wingLWrist', 'wingLClaw'],
                heavy_1: ['wingRWrist', 'wingRClaw'], air_1: ['wingRWrist', 'wingRClaw'],
            },
        },
    }),
    wyvern_claw: meleeClass({
        id: 'wyvern_claw', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 3, knockbackForce: 4, knockbackY: 1, detectionRange: 6,
        mountJointId: 'wingRWrist',
        detectBox: { size: { x: 1.0, y: 0.9, z: 1.0 }, offset: { x: 0, y: 0, z: 0.45 } },
    }, {
        one_handed: {
            chains: {
                light: {steps: ['light_1', 'light_2', 'light_3', 'light_4', 'light_5'], loop: true},
                heavy: {steps: [], loop: false},
            },
            air: {steps: ['air_1', 'air_2'], loop: false, momentum: 0.97, airControl: 0.35, poseKeys: ['light_1', 'light_5']},
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'],
                light_2: ['wingLWrist', 'wingLClaw'],
                light_3: ['mouthMount', 'jaw'],
                light_4: ['tailC', 'tailD'],
                light_5: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
                air_1: ['wingLWrist', 'wingRWrist'],
                air_2: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
            },
            impact: {
                light_1: {impact: 'medium', poiseDamage: 1},
                light_2: {impact: 'medium', poiseDamage: 1},
                light_3: {impact: 'medium', poiseDamage: 2},
                light_4: {impact: 'heavy', poiseDamage: 3},
                light_5: {impact: 'heavy', poiseDamage: 5},
                air_1: {impact: 'medium', poiseDamage: 2},
                air_2: {impact: 'heavy', poiseDamage: 4},
            },
        },
    }),
}

const MODELS: Record<string, WeaponModelConfig> = {
    wyvern_wing_blade: {
        id: 'wyvern_wing_blade', classId: 'wyvern_wing_blade', formId: FORM_ID, name: '翼刃', nameKey: 'weapon.wyvern_wing_blade',
        equipBodyParts: ['wing_claw'],
        mesh: { id: 'sword', bladeLen: 0.55, color: 0x9a7a5a, gripColor: 0x3a2a18 },
    },
    wyvern_claw: {
        id: 'wyvern_claw', classId: 'wyvern_claw', formId: FORM_ID, name: '龙爪', nameKey: 'weapon.wyvern_claw',
        equipBodyParts: ['wing_claw'],
        mesh: { id: 'none' },
    },
}

/** wyvern 全部武器 */
export const WYVERN_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
