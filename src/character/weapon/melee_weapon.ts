import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'

/**
 * 攻击检测箱（AI 出招触发判定专用，与红色伤害判定箱解耦）：
 * 盒尺寸 + 相对身体中心的偏移；身体局部坐标（+Z = 朝向），按角色 scale 缩放。
 * 攻击触发判定由武器上的这个属性直接驱动。
 */
export interface MeleeDetectBox {
    /** 盒尺寸：x = 侧向宽、y = 竖直高、z = 前后深（m，scale=1） */
    readonly size: { readonly x: number; readonly y: number; readonly z: number }
    /** 盒中心相对身体中心的偏移：z 正向 = 朝向前方（m，scale=1） */
    readonly offset: { readonly x: number; readonly y: number; readonly z: number }
}

/** 近战武器配置 — 玩家装备该武器的全部固有属性 */
export interface MeleeWeaponConfig {
    readonly id: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    readonly type: 'melee'
    readonly damage: number
    readonly knockbackForce: number
    readonly knockbackY: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 攻击检测箱：尺寸 + 身体偏移，驱动出招触发判定 */
    readonly detectBox: MeleeDetectBox
    /** 程序化武器模型 */
    readonly mesh: WeaponMeshConfig
}

export const MELEE_WEAPON_PRESETS: Record<string, MeleeWeaponConfig> = {
    short_sword: {
        id: 'short_sword', name: '短剑', type: 'melee',
        damage: 2,
        knockbackForce: 2, knockbackY: 1,
        detectionRange: 6,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'sword', bladeLen: 0.3, color: 0xcc5555, gripColor: 0x664422 },
    },
    long_sword: {
        id: 'long_sword', name: '长剑', type: 'melee',
        damage: 3,
        knockbackForce: 5, knockbackY: 2,
        detectionRange: 8,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'sword', bladeLen: 0.5, color: 0xcc6666, gripColor: 0x553322 },
    },
    heavy_sword: {
        id: 'heavy_sword', name: '巨剑', type: 'melee',
        damage: 8,
        knockbackForce: 8, knockbackY: 3,
        detectionRange: 10,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'heavy_sword', bladeLen: 0.65, color: 0x555566, gripColor: 0x332211 },
    },
    spear: {
        id: 'spear', name: '长枪', type: 'melee',
        damage: 5,
        knockbackForce: 4, knockbackY: 1,
        detectionRange: 10,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'spear', poleLen: 1.0, headLen: 0.2, color: 0x886644, headColor: 0xaaaaaa },
    },
    dual_axe: {
        id: 'dual_axe', name: '双斧', type: 'melee',
        damage: 6,
        knockbackForce: 7, knockbackY: 2,
        detectionRange: 7,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'dual_axe', bladeSize: 0.3, color: 0x888888, gripColor: 0x553322 },
    },
    war_hammer: {
        id: 'war_hammer', name: '战锤', type: 'melee',
        damage: 10,
        knockbackForce: 10, knockbackY: 4,
        detectionRange: 8,
        detectBox: { size: { x: 0.4, y: 1, z: 0.4 }, offset: { x: 0, y: 0, z: 0.2 } },
        mesh: { id: 'war_hammer', headSize: 0.35, color: 0x777777, gripColor: 0x443311 },
    },
}
