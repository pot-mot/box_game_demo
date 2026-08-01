import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'

/** 远程武器配置 — 玩家装备该武器的全部固有属性 */
export interface RangedWeaponConfig {
    readonly id: string
    readonly type: 'ranged'
    readonly damage: number
    /** 最大开火距离 */
    readonly range: number
    readonly knockbackForce: number
    readonly projectileSpeed: number
    readonly projectileLifetime: number
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 最佳战斗距离 */
    readonly idealRange: number
    /** 开始后撤的距离 */
    readonly retreatRange: number

    /** 程序化武器模型 */
    readonly mesh: WeaponMeshConfig

    // ── 可选模式 ──

    readonly spreadCount?: number
    readonly spreadAngle?: number
    readonly explosionRadius?: number
    readonly homingStrength?: number
    readonly throwAngle?: number
}

export const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = {
    longbow: {
        id: 'longbow', type: 'ranged',
        damage: 2, range: 10,
        knockbackForce: 3, projectileSpeed: 20, projectileLifetime: 3,
        detectionRange: 20, idealRange: 7, retreatRange: 4,
        mesh: { id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc },
    },
    crossbow: {
        id: 'crossbow', type: 'ranged',
        damage: 5, range: 8,
        knockbackForce: 4, projectileSpeed: 45, projectileLifetime: 1.5,
        detectionRange: 15, idealRange: 5, retreatRange: 3,
        mesh: { id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888 },
    },
    shotgun: {
        id: 'shotgun', type: 'ranged',
        damage: 1, range: 6,
        knockbackForce: 6, projectileSpeed: 15, projectileLifetime: 1.5,
        detectionRange: 10, idealRange: 3, retreatRange: 2,
        spreadCount: 6, spreadAngle: Math.PI * 0.08,
        mesh: { id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666 },
    },
    staff: {
        id: 'staff', type: 'ranged',
        damage: 3, range: 8,
        knockbackForce: 4, projectileSpeed: 10, projectileLifetime: 5,
        detectionRange: 18, idealRange: 5, retreatRange: 3,
        explosionRadius: 1.2,
        mesh: { id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff },
    },
    magic_wand: {
        id: 'magic_wand', type: 'ranged',
        damage: 1.5, range: 10,
        knockbackForce: 2, projectileSpeed: 8, projectileLifetime: 4,
        detectionRange: 16, idealRange: 6, retreatRange: 4,
        homingStrength: 0.3,
        mesh: { id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff },
    },
    throwing_axe: {
        id: 'throwing_axe', type: 'ranged',
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    },
    grenade: {
        id: 'grenade', type: 'ranged',
        damage: 4, range: 10,
        knockbackForce: 8, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 14, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 5, explosionRadius: 2.0,
        mesh: { id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311 },
    },
    molotov: {
        id: 'molotov', type: 'ranged',
        damage: 2, range: 10,
        knockbackForce: 5, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        explosionRadius: 1.5,
        mesh: { id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800 },
    },
    throwing_dart: {
        id: 'throwing_dart', type: 'ranged',
        damage: 1.5, range: 12,
        knockbackForce: 1, projectileSpeed: 30, projectileLifetime: 2,
        detectionRange: 16, idealRange: 8, retreatRange: 4,
        throwAngle: 0,
        mesh: { id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333 },
    },
}
