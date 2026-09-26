import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { CollisionCategory } from '../../physics/collision_category.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks } from './attack_chain.ts'
import { buildRangedAttacks } from './ranged_attacks.ts'

/**
 * 投掷物默认可穿过的碰撞类别 —— 仅水域（area）：
 * 其余类别（角色 / 箱子 / 碎片 / 地形 / 世界地面）命中即消失，见 `entity/character/combat/ranged_executor.ts`。
 */
export const DEFAULT_BULLET_PASS_THROUGH_CATEGORIES: readonly CollisionCategory[] = ['area']

/**
 * 远程武器配置 — 玩家装备该武器的全部固有属性。
 * **开火动作（阶段时序/时长）由武器模组拥有**（`attacks`），角色实体只持有武器与数值覆写；
 * 动画是段 id 对应的显式骨骼关键帧数据。
 */
export interface RangedWeaponConfig {
    readonly id: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    readonly type: 'ranged'
    /** 可支持的持握模式（数组；首个为默认模式，换武器时角色持握模式重置为首个） */
    readonly holdModes: readonly HoldMode[]
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

    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
    /** 副手（左手）武器模型（`dual_wield` 模式用；远程目前不使用）；undefined = 无副手武器 */
    readonly offhandMesh?: WeaponMeshConfig

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

    /** 持握模式 → 攻击链 map（单段开火动作：阶段时序/时长） */
    readonly attacks: HoldModeAttacks
}

/** 远程预设装配：按默认持握模式注入固有开火动作链 */
const rangedPreset = (base: Omit<RangedWeaponConfig, 'attacks'>): RangedWeaponConfig => {
    const attacks: Partial<Record<HoldMode, ReturnType<typeof buildRangedAttacks>>> = {}
    attacks[base.holdModes[0]] = buildRangedAttacks(base.id)
    return {...base, attacks}
}

export const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = {
    longbow: rangedPreset({
        id: 'longbow', name: '长弓', type: 'ranged',
        holdModes: ['two_handed'],
        damage: 2, range: 10,
        knockbackForce: 3, projectileSpeed: 20, projectileLifetime: 3,
        detectionRange: 20, idealRange: 7, retreatRange: 4,
        mesh: { id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc },
    }),
    crossbow: rangedPreset({
        id: 'crossbow', name: '弩', type: 'ranged',
        holdModes: ['two_handed'],
        damage: 5, range: 8,
        knockbackForce: 4, projectileSpeed: 45, projectileLifetime: 1.5,
        detectionRange: 15, idealRange: 5, retreatRange: 3,
        mesh: { id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888 },
    }),
    shotgun: rangedPreset({
        id: 'shotgun', name: '霰弹枪', type: 'ranged',
        holdModes: ['two_handed'],
        damage: 1, range: 6,
        knockbackForce: 6, projectileSpeed: 15, projectileLifetime: 1.5,
        detectionRange: 10, idealRange: 3, retreatRange: 2,
        spreadCount: 6, spreadAngle: Math.PI * 0.08,
        mesh: { id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666 },
    }),
    staff: rangedPreset({
        id: 'staff', name: '法杖', type: 'ranged',
        holdModes: ['two_handed'],
        damage: 3, range: 8,
        knockbackForce: 4, projectileSpeed: 10, projectileLifetime: 5,
        detectionRange: 18, idealRange: 5, retreatRange: 3,
        explosionRadius: 1.2,
        mesh: { id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff },
    }),
    magic_wand: rangedPreset({
        id: 'magic_wand', name: '魔杖', type: 'ranged',
        holdModes: ['one_handed'],
        damage: 1.5, range: 10,
        knockbackForce: 2, projectileSpeed: 8, projectileLifetime: 4,
        detectionRange: 16, idealRange: 6, retreatRange: 4,
        homingStrength: 0.3,
        mesh: { id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff },
    }),
    throwing_axe: rangedPreset({
        id: 'throwing_axe', name: '飞斧', type: 'ranged',
        holdModes: ['one_handed'],
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    }),
    grenade: rangedPreset({
        id: 'grenade', name: '手雷', type: 'ranged',
        holdModes: ['one_handed'],
        damage: 4, range: 10,
        knockbackForce: 8, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 14, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 5, explosionRadius: 2.0,
        mesh: { id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311 },
    }),
    molotov: rangedPreset({
        id: 'molotov', name: '燃烧瓶', type: 'ranged',
        holdModes: ['one_handed'],
        damage: 2, range: 10,
        knockbackForce: 5, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        explosionRadius: 1.5,
        mesh: { id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800 },
    }),
    throwing_dart: rangedPreset({
        id: 'throwing_dart', name: '飞镖', type: 'ranged',
        holdModes: ['one_handed'],
        damage: 1.5, range: 12,
        knockbackForce: 1, projectileSpeed: 30, projectileLifetime: 2,
        detectionRange: 16, idealRange: 8, retreatRange: 4,
        throwAngle: 0,
        mesh: { id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333 },
    }),
}
