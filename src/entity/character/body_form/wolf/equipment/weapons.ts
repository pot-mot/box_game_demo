import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../../character/weapon/melee_weapon.ts'

/**
 * 狼武器表（formId = 'wolf'）：天然撕咬 + 口含剑（复用 `sword` 网格，独立武器条目）。
 * - 撕咬：轻 1–2 两段撕咬，重击蓄力突进咬；
 * - 口含剑：轻 1–3 三段颈甩，重击蓄力旋斩；剑横咬（挂点旋转 90°）。
 */

const FORM_ID = 'wolf'

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wolf_bite: meleeClass({
        id: 'wolf_bite', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 4, knockbackForce: 3, knockbackY: 1, detectionRange: 6,
        mountJointId: 'mouthMount',
        detectBox: { size: { x: 0.45, y: 0.5, z: 0.9 }, offset: { x: 0, y: 0, z: 0.45 } },
        impulses: {
            heavy_1: [{at: 0.5, direction: {x: 0, y: 0, z: 1}, speed: 4.5, relativeToFacing: true}],
        },
    }, {
        one_handed: {
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
    wolf_short_sword: meleeClass({
        id: 'wolf_short_sword', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 2, knockbackForce: 2, knockbackY: 1, detectionRange: 6,
        /* 口含剑横咬：绕 X 转 90° 使刃身指向前方（+Z），再绕刃轴转 90° 让刃面水平 */
        mountJointId: 'mouthMount', mountRotation: [Math.PI / 2, Math.PI / 2, 0],
        detectBox: { size: { x: 0.9, y: 0.7, z: 0.8 }, offset: { x: 0, y: 0, z: 0.35 } },
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
    wolf_claw_blade: meleeClass({
        id: 'wolf_claw_blade', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 3, knockbackForce: 3, knockbackY: 1, detectionRange: 5,
        mountJointId: 'flFoot',
        detectBox: { size: { x: 0.6, y: 0.6, z: 0.7 }, offset: { x: 0, y: 0, z: 0.3 } },
    }, {
        one_handed: {
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
        id: 'wolf_long_sword', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 3, knockbackForce: 5, knockbackY: 2, detectionRange: 8,
        /* 口含剑横咬：绕 X 转 90° 使刃身指向前方（+Z），再绕刃轴转 90° 让刃面水平 */
        mountJointId: 'mouthMount', mountRotation: [Math.PI / 2, Math.PI / 2, 0],
        detectBox: { size: { x: 1.0, y: 0.7, z: 0.94 }, offset: { x: 0, y: 0, z: 0.4 } },
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
}

const MODELS: Record<string, WeaponModelConfig> = {
    wolf_bite: {
        id: 'wolf_bite', classId: 'wolf_bite', formId: FORM_ID, name: '撕咬', nameKey: 'weapon.wolf_bite',
        equipBodyParts: ['head'],
        mesh: { id: 'none' },
    },
    wolf_short_sword: {
        id: 'wolf_short_sword', classId: 'wolf_short_sword', formId: FORM_ID, name: '短剑', nameKey: 'weapon.wolf_short_sword',
        equipBodyParts: ['head'],
        mesh: { id: 'sword', bladeLen: 0.34, color: 0xcc5555, gripColor: 0x664422 },
    },
    wolf_claw_blade: {
        id: 'wolf_claw_blade', classId: 'wolf_claw_blade', formId: FORM_ID, name: '爪刃', nameKey: 'weapon.wolf_claw_blade',
        equipBodyParts: ['claw'],
        mesh: { id: 'sword', bladeLen: 0.3, color: 0x8a8f98, gripColor: 0x332211 },
    },
    wolf_long_sword: {
        id: 'wolf_long_sword', classId: 'wolf_long_sword', formId: FORM_ID, name: '长剑', nameKey: 'weapon.wolf_long_sword',
        equipBodyParts: ['head'],
        mesh: { id: 'sword', bladeLen: 0.56, color: 0xcc6666, gripColor: 0x553322 },
    },
}

/** 狼全部武器 */
export const WOLF_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
