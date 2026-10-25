import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import type {AttackModuleDef} from '../../../../../character/weapon/attack_module.ts'
import type {WeaponAttackBoxSpec} from '../../../../../character/weapon/mesh_config.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 狼武器表（formId = 'wolf'）：天然嘴 / 天然爪 + 可选口含剑 / 爪刃。
 * - 头槽默认天然嘴（撕咬）；爪槽默认天然爪（无可见网格）。
 * - 口含短剑 / 长剑替换头槽，爪刃替换爪槽；攻击模组由对应槽位武器提供。
 */

const FORM_ID = 'wolf'

const moduleOf = (id: string, nameKey: WeaponModelConfig['nameKey']): readonly AttackModuleDef[] => [{id, nameKey}]

const attackBox = (
    jointId: string,
    center: {x: number; y: number; z: number},
    half: {x: number; y: number; z: number},
): WeaponAttackBoxSpec => ({
    jointId,
    center,
    half,
    rotation: {x: 0, y: 0, z: 0},
    reach: center.y + half.y,
})

const MOUTH_BOX = attackBox('mouthMount', {x: 0, y: 0.2, z: 0}, {x: 0.15, y: 0.15, z: 0.2})
const CLAW_BOXES: readonly WeaponAttackBoxSpec[] = [
    attackBox('flFoot', {x: 0, y: 0.2, z: 0}, {x: 0.15, y: 0.15, z: 0.2}),
    attackBox('frFoot', {x: 0, y: 0.2, z: 0}, {x: 0.15, y: 0.15, z: 0.2}),
    attackBox('rlFoot', {x: 0, y: 0.2, z: 0}, {x: 0.15, y: 0.15, z: 0.2}),
    attackBox('rrFoot', {x: 0, y: 0.2, z: 0}, {x: 0.15, y: 0.15, z: 0.2}),
]

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wolf_bite: meleeClass({
        id: 'wolf_bite', type: 'melee', natural: true, damageType: 'physical',
        attackModules: moduleOf('mouth', 'weapon.wolf_bite'),
        damage: 4, knockbackForce: 3, knockbackY: 1, detectionRange: 6,
        mountJointId: 'mouthMount',
        detectBoxes: [{jointId: 'body', size: {x: 0.45, y: 0.5, z: 0.9}, offset: {x: 0, y: 0, z: 0.45}, rotation: {x: 0, y: 0, z: 0}}],
        impulses: {
            heavy_1: [{at: 0.5, direction: {x: 0, y: 0, z: 1}, speed: 4.5, relativeToFacing: true}],
        },
    }, {
        mouth: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['mouthMount'], light_2: ['mouthMount'], heavy_1: ['mouthMount'], air_1: ['mouthMount'],
            },
            impact: {
                light_1: {impact: 'medium', poiseDamage: 1},
                light_2: {impact: 'medium', poiseDamage: 1},
                heavy_1: {impact: 'heavy', poiseDamage: 4},
            },
        },
    }),
    wolf_claw: meleeClass({
        id: 'wolf_claw', type: 'melee', natural: true, damageType: 'physical',
        attackModules: moduleOf('claw', 'weapon.wolf_claw'),
        damage: 3, knockbackForce: 3, knockbackY: 1, detectionRange: 5,
        mountJointId: 'flFoot',
        detectBoxes: [{jointId: 'body', size: {x: 0.6, y: 0.6, z: 0.7}, offset: {x: 0, y: 0, z: 0.3}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        claw: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['flFoot', 'frFoot'], light_2: ['rlFoot', 'rrFoot'],
                heavy_1: ['flFoot', 'frFoot'], air_1: ['flFoot', 'frFoot'],
            },
            impact: {
                light_1: {impact: 'medium', poiseDamage: 1},
                light_2: {impact: 'medium', poiseDamage: 1},
                heavy_1: {impact: 'heavy', poiseDamage: 4},
            },
        },
    }),
    wolf_short_sword: meleeClass({
        id: 'wolf_short_sword', type: 'melee', damageType: 'physical',
        attackModules: moduleOf('mouth', 'weapon.wolf_short_sword'),
        damage: 2, knockbackForce: 2, knockbackY: 1, detectionRange: 6,
        /* 口含剑横咬：绕 X 转 90° 使刃身指向前方（+Z），再绕刃轴转 90° 让刃面水平 */
        mountJointId: 'mouthMount', mountRotation: [Math.PI / 2, Math.PI / 2, 0],
        detectBoxes: [{jointId: 'body', size: {x: 0.9, y: 0.7, z: 0.8}, offset: {x: 0, y: 0, z: 0.35}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        mouth: {
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
    wolf_claw_blade: meleeClass({
        id: 'wolf_claw_blade', type: 'melee', damageType: 'physical',
        attackModules: moduleOf('claw', 'weapon.wolf_claw_blade'),
        damage: 3, knockbackForce: 3, knockbackY: 1, detectionRange: 5,
        mountJointId: 'flFoot',
        detectBoxes: [{jointId: 'body', size: {x: 0.6, y: 0.6, z: 0.7}, offset: {x: 0, y: 0, z: 0.3}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        claw: {
            chains: {
                light: {steps: ['light_1', 'light_2'], loop: true},
                heavy: {steps: ['heavy_1'], loop: false},
            },
            hitMounts: {
                light_1: ['flFoot', 'frFoot'], light_2: ['rlFoot', 'rrFoot'],
                heavy_1: ['flFoot', 'frFoot'], air_1: ['flFoot', 'frFoot'],
            },
        },
    }),
    wolf_long_sword: meleeClass({
        id: 'wolf_long_sword', type: 'melee', damageType: 'physical',
        attackModules: moduleOf('mouth', 'weapon.wolf_long_sword'),
        damage: 3, knockbackForce: 5, knockbackY: 2, detectionRange: 8,
        /* 口含剑横咬：绕 X 转 90° 使刃身指向前方（+Z），再绕刃轴转 90° 让刃面水平 */
        mountJointId: 'mouthMount', mountRotation: [Math.PI / 2, Math.PI / 2, 0],
        detectBoxes: [{jointId: 'body', size: {x: 1.0, y: 0.7, z: 0.94}, offset: {x: 0, y: 0, z: 0.4}, rotation: {x: 0, y: 0, z: 0}}],
    }, {
        mouth: {
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
}

const MODELS: Record<string, WeaponModelConfig> = {
    wolf_bite: {
        id: 'wolf_bite', classId: 'wolf_bite', formId: FORM_ID, name: '狼吻', nameKey: 'weapon.wolf_bite',
        equipBodyParts: ['head'],
        mesh: {id: 'none'},
        attackBoxes: [MOUTH_BOX],
        colliders: [],
        hurtBoxes: [],
    },
    wolf_claw: {
        id: 'wolf_claw', classId: 'wolf_claw', formId: FORM_ID, name: '狼爪', nameKey: 'weapon.wolf_claw',
        equipBodyParts: ['claw'],
        mesh: {id: 'none'},
        mounts: [
            {jointId: 'flFoot', mesh: {id: 'none'}},
            {jointId: 'frFoot', mesh: {id: 'none'}},
            {jointId: 'rlFoot', mesh: {id: 'none'}},
            {jointId: 'rrFoot', mesh: {id: 'none'}},
        ],
        attackBoxes: CLAW_BOXES,
        colliders: [],
        hurtBoxes: [],
    },
    wolf_short_sword: {
        id: 'wolf_short_sword', classId: 'wolf_short_sword', formId: FORM_ID, name: '短剑', nameKey: 'weapon.wolf_short_sword',
        equipBodyParts: ['head'],
        mesh: {id: 'sword', bladeLen: 0.34, color: 0xcc5555, gripColor: 0x664422},
        attackBoxes: [MOUTH_BOX],
        colliders: [],
        hurtBoxes: [],
    },
    wolf_claw_blade: {
        id: 'wolf_claw_blade', classId: 'wolf_claw_blade', formId: FORM_ID, name: '爪刃', nameKey: 'weapon.wolf_claw_blade',
        equipBodyParts: ['claw'],
        mesh: {id: 'sword', bladeLen: 0.3, color: 0x8a8f98, gripColor: 0x332211},
        attackBoxes: CLAW_BOXES,
        colliders: [],
        hurtBoxes: [],
    },
    wolf_long_sword: {
        id: 'wolf_long_sword', classId: 'wolf_long_sword', formId: FORM_ID, name: '长剑', nameKey: 'weapon.wolf_long_sword',
        equipBodyParts: ['head'],
        mesh: {id: 'sword', bladeLen: 0.56, color: 0xcc6666, gripColor: 0x553322},
        attackBoxes: [MOUTH_BOX],
        colliders: [],
        hurtBoxes: [],
    },
}

/** 狼全部武器 */
export const WOLF_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
