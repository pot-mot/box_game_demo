import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { CollisionCategory } from '../../physics/collision_category.ts'

/**
 * 投掷物默认可穿过的碰撞类别 —— 仅水域（area）：
 * 其余类别（角色 / 箱子 / 碎片 / 地形 / 世界地面）命中即消失，见 `entity/character/combat/ranged_executor.ts`。
 */
export const DEFAULT_BULLET_PASS_THROUGH_CATEGORIES: readonly CollisionCategory[] = ['area']

/** 远程武器配置 — 玩家装备该武器的全部固有属性 */
export interface RangedWeaponConfig {
    readonly id: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
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
    /**
     * 子弹可穿过的碰撞类别列表（默认 `DEFAULT_BULLET_PASS_THROUGH_CATEGORIES` = 仅 area）：
     * 命中列表内类别的物体时子弹继续飞行，命中其它类别（角色 / 箱子 / 碎片 / 地形 / 世界地面）即消失。
     */
    readonly passThroughCategories?: readonly CollisionCategory[]
}

export const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = {
    longbow: {
        id: 'longbow', name: '长弓', type: 'ranged',
        damage: 2, range: 10,
        knockbackForce: 3, projectileSpeed: 20, projectileLifetime: 3,
        detectionRange: 20, idealRange: 7, retreatRange: 4,
        mesh: { id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc },
    },
    crossbow: {
        id: 'crossbow', name: '弩', type: 'ranged',
        damage: 5, range: 8,
        knockbackForce: 4, projectileSpeed: 45, projectileLifetime: 1.5,
        detectionRange: 15, idealRange: 5, retreatRange: 3,
        mesh: { id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888 },
    },
    shotgun: {
        id: 'shotgun', name: '霰弹枪', type: 'ranged',
        damage: 1, range: 6,
        knockbackForce: 6, projectileSpeed: 15, projectileLifetime: 1.5,
        detectionRange: 10, idealRange: 3, retreatRange: 2,
        spreadCount: 6, spreadAngle: Math.PI * 0.08,
        mesh: { id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666 },
    },
    staff: {
        id: 'staff', name: '法杖', type: 'ranged',
        damage: 3, range: 8,
        knockbackForce: 4, projectileSpeed: 10, projectileLifetime: 5,
        detectionRange: 18, idealRange: 5, retreatRange: 3,
        explosionRadius: 1.2,
        mesh: { id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff },
    },
    magic_wand: {
        id: 'magic_wand', name: '魔杖', type: 'ranged',
        damage: 1.5, range: 10,
        knockbackForce: 2, projectileSpeed: 8, projectileLifetime: 4,
        detectionRange: 16, idealRange: 6, retreatRange: 4,
        homingStrength: 0.3,
        mesh: { id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff },
    },
    throwing_axe: {
        id: 'throwing_axe', name: '飞斧', type: 'ranged',
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    },
    grenade: {
        id: 'grenade', name: '手雷', type: 'ranged',
        damage: 4, range: 10,
        knockbackForce: 8, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 14, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 5, explosionRadius: 2.0,
        mesh: { id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311 },
    },
    molotov: {
        id: 'molotov', name: '燃烧瓶', type: 'ranged',
        damage: 2, range: 10,
        knockbackForce: 5, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        explosionRadius: 1.5,
        mesh: { id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800 },
    },
    throwing_dart: {
        id: 'throwing_dart', name: '飞镖', type: 'ranged',
        damage: 1.5, range: 12,
        knockbackForce: 1, projectileSpeed: 30, projectileLifetime: 2,
        detectionRange: 16, idealRange: 8, retreatRange: 4,
        throwAngle: 0,
        mesh: { id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333 },
    },
}
