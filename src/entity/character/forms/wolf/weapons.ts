import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {WeaponModelConfig} from '../../../../character/weapon/weapon_class.ts'
import {meleeClass, resolveMeleeWeapon, type MeleeWeaponClassConfig} from '../../../../character/weapon/melee_weapon.ts'

/**
 * 狼武器表（formId = 'wolf'）：天然撕咬 + 口含剑（复用 `sword` 网格，独立武器条目）。
 * 天然武器无可视模型（`mesh: none`），咬击动作由狼体形分包提供。
 */

const FORM_ID = 'wolf'

const CLASSES: Record<string, MeleeWeaponClassConfig> = {
    wolf_bite: meleeClass({
        id: 'wolf_bite', type: 'melee', natural: true, damageType: 'physical', holdModes: ['one_handed'],
        damage: 4, knockbackForce: 3, knockbackY: 1, detectionRange: 6,
        detectBox: { size: { x: 0.45, y: 0.5, z: 0.8 }, offset: { x: 0, y: 0, z: 0.4 } },
    }, { one_handed: {} }),
    wolf_short_sword: meleeClass({
        id: 'wolf_short_sword', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 2, knockbackForce: 2, knockbackY: 1, detectionRange: 6,
        detectBox: { size: { x: 0.5, y: 0.7, z: 0.8 }, offset: { x: 0, y: 0, z: 0.35 } },
    }, { one_handed: {} }),
    wolf_long_sword: meleeClass({
        id: 'wolf_long_sword', type: 'melee', damageType: 'physical', holdModes: ['one_handed'],
        damage: 3, knockbackForce: 5, knockbackY: 2, detectionRange: 8,
        detectBox: { size: { x: 0.5, y: 0.7, z: 0.94 }, offset: { x: 0, y: 0, z: 0.4 } },
    }, { one_handed: {} }),
}

const MODELS: Record<string, WeaponModelConfig> = {
    wolf_bite: {
        id: 'wolf_bite', classId: 'wolf_bite', formId: FORM_ID, name: '撕咬', nameKey: 'weapon.wolf_bite',
        mesh: { id: 'none' },
    },
    wolf_short_sword: {
        id: 'wolf_short_sword', classId: 'wolf_short_sword', formId: FORM_ID, name: '短剑', nameKey: 'weapon.wolf_short_sword',
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422 },
    },
    wolf_long_sword: {
        id: 'wolf_long_sword', classId: 'wolf_long_sword', formId: FORM_ID, name: '长剑', nameKey: 'weapon.wolf_long_sword',
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322 },
    },
}

/** 狼全部武器 */
export const WOLF_WEAPONS: readonly WeaponConfig[] = Object.values(MODELS)
    .map(model => resolveMeleeWeapon(CLASSES[model.classId]!, model))
