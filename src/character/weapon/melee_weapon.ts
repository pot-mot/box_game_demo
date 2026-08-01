import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'

/** 近战武器配置 — 玩家装备该武器的全部固有属性 */
export interface MeleeWeaponConfig {
    readonly id: string
    readonly type: 'melee'
    readonly damage: number
    readonly range: number
    readonly knockbackForce: number
    readonly knockbackY: number
    readonly arcAngle: number
    readonly arcRadius: number
    readonly arcTilt: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 程序化武器模型 */
    readonly mesh: WeaponMeshConfig
}

export const MELEE_WEAPON_PRESETS: Record<string, MeleeWeaponConfig> = {
    short_sword: {
        id: 'short_sword', type: 'melee',
        damage: 2, range: 1.2,
        knockbackForce: 2, knockbackY: 1,
        arcAngle: Math.PI * 0.8, arcRadius: 0.3, arcTilt: 0,
        detectionRange: 6,
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422 },
    },
    long_sword: {
        id: 'long_sword', type: 'melee',
        damage: 3, range: 1.5,
        knockbackForce: 5, knockbackY: 2,
        arcAngle: Math.PI / 2, arcRadius: 0.4, arcTilt: 0,
        detectionRange: 8,
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322 },
    },
    heavy_sword: {
        id: 'heavy_sword', type: 'melee',
        damage: 8, range: 2.0,
        knockbackForce: 8, knockbackY: 3,
        arcAngle: Math.PI * 0.39, arcRadius: 0.5, arcTilt: -Math.PI * 0.2,
        detectionRange: 10,
        mesh: { id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211 },
    },
    spear: {
        id: 'spear', type: 'melee',
        damage: 5, range: 2.5,
        knockbackForce: 4, knockbackY: 1,
        arcAngle: Math.PI * 0.25, arcRadius: 0.65, arcTilt: 0,
        detectionRange: 10,
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa },
    },
    dual_axe: {
        id: 'dual_axe', type: 'melee',
        damage: 6, range: 1.3,
        knockbackForce: 7, knockbackY: 2,
        arcAngle: Math.PI * 1.2, arcRadius: 0.25, arcTilt: Math.PI * 0.1,
        detectionRange: 7,
        mesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322 },
    },
    war_hammer: {
        id: 'war_hammer', type: 'melee',
        damage: 10, range: 1.8,
        knockbackForce: 10, knockbackY: 4,
        arcAngle: Math.PI * 0.35, arcRadius: 0.5, arcTilt: -Math.PI * 0.3,
        detectionRange: 8,
        mesh: { id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311 },
    },
}
