import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import type {WeaponAttackBoxSpec} from '../../../../../character/weapon/mesh_config.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 双足飞龙武器表（formId = 'wyvern'）：天然爪击 + 翼刃。
 * - 爪：五段轻爪 + 重爪（重爪为爪模组的重击）；
 * - 吐息：独立 breath 槽提供重击，轻 / 空仍使用翼爪槽武器（“轻爪重吐息”）。
 */

const FORM_ID = 'wyvern'

const clawBox = (jointId: string): WeaponAttackBoxSpec => ({
    jointId,
    center: {x: 0, y: 0.2, z: 0},
    half: {x: 0.15, y: 0.15, z: 0.2},
    rotation: {x: 0, y: 0, z: 0},
    reach: 0.35,
})

const CLAW_BOXES: readonly WeaponAttackBoxSpec[] = [
    'wingLWrist', 'wingLClaw', 'wingRWrist', 'wingRClaw',
    'mouthMount', 'jaw', 'tailC', 'tailD',
].map(clawBox)

const CLAW_AIR = {
    steps: ['air_1', 'air_2'] as const,
    loop: false,
    momentum: 0.97,
    airControl: 0.35,
    poseKeys: ['light_1', 'light_5'] as const,
}

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wyvern_wing_blade: meleeClass({
        id: 'wyvern_wing_blade', type: 'melee', damageType: 'physical',
        attackModules: [
            {id: 'claw', nameKey: 'weapon.wyvern_wing_blade'},
            {id: 'breath', nameKey: 'attack_module.breath', requiredSlots: ['breath'], heavySlot: 'breath'},
        ],
        damage: 4, knockbackForce: 5, knockbackY: 2, detectionRange: 7,
        mountJointId: 'wingRWrist',
        detectBoxes: [{jointId: 'body', size: {x: 0.9, y: 0.8, z: 0.9}, offset: {x: 0, y: 0, z: 0.4}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        claw: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'], light_2: ['wingLWrist', 'wingLClaw'],
                heavy_1: ['wingRWrist', 'wingRClaw'], air_1: ['wingRWrist', 'wingRClaw'],
            },
        },
        breath: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: [], loop: false},
            },
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'], light_2: ['wingLWrist', 'wingLClaw'],
                heavy_1: ['wingRWrist', 'wingRClaw'], air_1: ['wingRWrist', 'wingRClaw'],
            },
        },
    }),
    wyvern_claw: meleeClass({
        id: 'wyvern_claw', type: 'melee', natural: true, damageType: 'physical',
        attackModules: [
            {id: 'claw', nameKey: 'weapon.wyvern_claw'},
            {id: 'breath', nameKey: 'attack_module.breath', requiredSlots: ['breath'], heavySlot: 'breath'},
        ],
        damage: 3, knockbackForce: 4, knockbackY: 1, detectionRange: 6,
        mountJointId: 'wingRWrist',
        detectBoxes: [{jointId: 'body', size: {x: 1.0, y: 0.9, z: 1.0}, offset: {x: 0, y: 0, z: 0.45}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        claw: {
            chains: {
                light: {steps: ['light_1', 'light_2', 'light_3', 'light_4', 'light_5'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            air: CLAW_AIR,
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'],
                light_2: ['wingLWrist', 'wingLClaw'],
                light_3: ['mouthMount', 'jaw'],
                light_4: ['tailC', 'tailD'],
                light_5: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
                heavy_1: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
                air_1: ['wingLWrist', 'wingRWrist'],
                air_2: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
            },
            impact: {
                light_1: {impact: 'medium', poiseDamage: 1},
                light_2: {impact: 'medium', poiseDamage: 1},
                light_3: {impact: 'medium', poiseDamage: 2},
                light_4: {impact: 'heavy', poiseDamage: 3},
                light_5: {impact: 'heavy', poiseDamage: 5},
                heavy_1: {impact: 'knockdown', poiseDamage: 7},
                air_1: {impact: 'medium', poiseDamage: 2},
                air_2: {impact: 'heavy', poiseDamage: 4},
            },
        },
        /* 静态占位链：轻 / 空与爪一致，重击由运行时从 breath 槽组合； */
        breath: {
            chains: {
                light: {steps: ['light_1', 'light_2', 'light_3', 'light_4', 'light_5'], loop: true},
                heavy: {steps: [], loop: false},
            },
            air: CLAW_AIR,
            hitMounts: {
                light_1: ['wingRWrist', 'wingRClaw'],
                light_2: ['wingLWrist', 'wingLClaw'],
                light_3: ['mouthMount', 'jaw'],
                light_4: ['tailC', 'tailD'],
                light_5: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
                air_1: ['wingLWrist', 'wingRWrist'],
                air_2: ['wingLWrist', 'wingRWrist', 'wingLClaw', 'wingRClaw'],
            },
        },
    }),
}

const MODELS: Record<string, WeaponModelConfig> = {
    wyvern_wing_blade: {
        id: 'wyvern_wing_blade', classId: 'wyvern_wing_blade', formId: FORM_ID, name: '翼刃', nameKey: 'weapon.wyvern_wing_blade',
        equipBodyParts: ['wing_claw'],
        mesh: {id: 'sword', bladeLen: 0.55, color: 0x9a7a5a, gripColor: 0x3a2a18},
        attackBoxes: [clawBox('wingRWrist'), clawBox('wingRClaw'), clawBox('wingLWrist'), clawBox('wingLClaw')],
        colliders: [],
        hurtBoxes: [],
    },
    wyvern_claw: {
        id: 'wyvern_claw', classId: 'wyvern_claw', formId: FORM_ID, name: '龙爪', nameKey: 'weapon.wyvern_claw',
        equipBodyParts: ['wing_claw'],
        mesh: {id: 'none'},
        mounts: [
            {jointId: 'wingLClaw', mesh: {id: 'none'}},
            {jointId: 'wingRClaw', mesh: {id: 'none'}},
        ],
        attackBoxes: CLAW_BOXES,
        colliders: [],
        hurtBoxes: [],
    },
}

/** wyvern 全部武器 */
export const WYVERN_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
