import type { WeaponMeshConfig } from '../../entity/character/appearance/weapon_mesh.ts'
import type { DamageType } from '../combat/damage_type.ts'
import type { CollisionCategory } from '../../physics/collision_category.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks, WeaponAttacks } from './attack_chain.ts'
import { withChargeTuningMap } from './attack_chain.ts'
import { buildRangedAttacks } from './ranged_attacks.ts'
import type { WeaponModelConfig } from './weapon_class.ts'
import type { ProjectileVisualSpec } from './projectile_visual.ts'
import type { ChargeTuning } from './charge_tuning.ts'

/**
 * 投掷物默认可穿过的碰撞类别 —— 仅水域（area）：
 * 其余类别（角色 / 箱子 / 碎片 / 地形 / 世界地面）命中即消失，见 `entity/character/combat/ranged_executor.ts`。
 */
export const DEFAULT_BULLET_PASS_THROUGH_CATEGORIES: readonly CollisionCategory[] = ['area']

/**
 * 弹丸默认重力缩放（`RangedWeaponConfig.projectileGravityScale` 缺省时由弹丸系统取用）。
 * 定义在武器域，与「可选字段 + 运行时缺省」的契约同源，供武器数据与测试共用。
 */
export const DEFAULT_PROJECTILE_GRAVITY_SCALE = 0.15

/**
 * 弹丸蓄力曲线（弓与投掷类声明）：在通用蓄力调参 `ChargeTuning`（最大倍率 / 最长时间）
 * 之上，额外声明初速与生命期的缩放区间（控制投掷远近）。伤害倍率由 `maxChargeMultiplier` 决定。
 * 玩家按住蓄力键控制力度；AI 不蓄力（按预设值发射，不套用该曲线）。
 */
export interface ProjectileChargeCurve extends ChargeTuning {
    /** 最小 / 最大初速倍率（控制射程与投掷远近） */
    readonly minSpeedScale: number
    readonly maxSpeedScale: number
    /** 最小 / 最大生命期倍率（与初速共同决定最大射程） */
    readonly minLifetimeScale: number
    readonly maxLifetimeScale: number
}

/**
 * 远程武器类（weapon class）— 同类全部模型共享的固有属性。
 * **开火动作（阶段时序/时长）由武器类拥有**（`attacks`），动画是段 id 对应的显式骨骼关键帧数据。
 */
export interface RangedWeaponClassConfig {
    readonly id: string
    readonly type: 'ranged'
    /** 攻击类别（武器固有，不可被存档/面板覆写）：弹丸与爆炸伤害均按此类别结算防御 */
    readonly damageType: DamageType
    /** 可支持的持握模式（数组；首个为默认模式，换武器时角色持握模式重置为首个） */
    readonly holdModes: readonly HoldMode[]
    readonly damage: number
    /** 最大开火距离 */
    readonly range: number
    readonly knockbackForce: number
    readonly projectileSpeed: number
    readonly projectileLifetime: number
    /**
     * 弹丸重力缩放（1 = 世界重力全额，0 = 完全不受重力）。
     * 缺省取同文件的 `DEFAULT_PROJECTILE_GRAVITY_SCALE`：
     * 直线弹（弓 / 弩 / 枪 / 魔法）接近 0，投掷物保留可读弧线。
     * 与伤害类别一样是武器类固有属性，不可被存档 / 面板覆写。
     */
    readonly projectileGravityScale?: number
    /** 弹丸视觉规格（箭矢 / 弩矢 / 弹头 / 复用武器模型 / 魔法球 + 轨迹） */
    readonly projectile: ProjectileVisualSpec
    /**
     * 蓄力曲线（仅弓与投掷类声明）：玩家按住蓄力键、松开出手，力度按 0→1 缩放弹道与伤害。
     * 声明后需保证该武器类对应的段声明了 `chargeFullTime` 与 `chargeable` 阶段（见 `ranged_attacks.ts`）。
     */
    readonly charge?: ProjectileChargeCurve
    /** AI 侦测范围 */
    readonly detectionRange: number
    /** 最佳战斗距离 */
    readonly idealRange: number
    /** 开始后撤的距离 */
    readonly retreatRange: number

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

/** 解析后的远程武器 = 武器类固有属性 + 所属模型（模型 id / 名称 / 网格） */
export interface RangedWeaponConfig extends RangedWeaponClassConfig {
    /** 所属武器类 id（双持同类判定用；见 catalog.ts 的 sameWeaponClass） */
    readonly classId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
}

/** 远程武器类装配：按默认持握模式注入固有开火动作链 */
const rangedClass = (base: Omit<RangedWeaponClassConfig, 'attacks'>): RangedWeaponClassConfig => {
    const attacks: Partial<Record<HoldMode, WeaponAttacks>> = {}
    attacks[base.holdModes[0]] = buildRangedAttacks(base.id, base.charge)
    return {...base, attacks}
}

/** 远程武器类目录（键 = 类 id） */
export const RANGED_WEAPON_CLASSES: Record<string, RangedWeaponClassConfig> = {
    longbow: rangedClass({
        id: 'longbow', type: 'ranged',
        damageType: 'physical',
        holdModes: ['two_handed'],
        damage: 2, range: 10,
        knockbackForce: 3, projectileSpeed: 20, projectileLifetime: 3,
        detectionRange: 20, idealRange: 7, retreatRange: 4,
        projectile: {kind: 'arrow'}, projectileGravityScale: 0.08,
        /* 蓄力：低蓄力近射低伤，满蓄力远射高伤 */
        charge: {maxChargeMultiplier: 180, maxChargeTime: 1, minSpeedScale: 0.55, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.3},
    }),
    crossbow: rangedClass({
        id: 'crossbow', type: 'ranged',
        damageType: 'physical',
        holdModes: ['two_handed'],
        damage: 5, range: 8,
        knockbackForce: 4, projectileSpeed: 45, projectileLifetime: 1.5,
        detectionRange: 15, idealRange: 5, retreatRange: 3,
        projectile: {kind: 'bolt'}, projectileGravityScale: 0.02,
    }),
    shotgun: rangedClass({
        id: 'shotgun', type: 'ranged',
        damageType: 'physical',
        holdModes: ['two_handed'],
        damage: 1, range: 6,
        knockbackForce: 6, projectileSpeed: 15, projectileLifetime: 1.5,
        detectionRange: 10, idealRange: 3, retreatRange: 2,
        spreadCount: 6, spreadAngle: Math.PI * 0.08,
        projectile: {kind: 'bullet'}, projectileGravityScale: 0.04,
    }),
    staff: rangedClass({
        id: 'staff', type: 'ranged',
        damageType: 'magic',
        holdModes: ['two_handed'],
        damage: 3, range: 8,
        knockbackForce: 4, projectileSpeed: 10, projectileLifetime: 5,
        detectionRange: 18, idealRange: 5, retreatRange: 3,
        explosionRadius: 1.2,
        projectile: {kind: 'magic_orb', explosionStyle: 'magic'}, projectileGravityScale: 0.05,
    }),
    magic_wand: rangedClass({
        id: 'magic_wand', type: 'ranged',
        damageType: 'magic',
        holdModes: ['one_handed'],
        damage: 1.5, range: 10,
        knockbackForce: 2, projectileSpeed: 8, projectileLifetime: 4,
        detectionRange: 16, idealRange: 6, retreatRange: 4,
        homingStrength: 0.3,
        projectile: {kind: 'magic_orb'}, projectileGravityScale: 0,
    }),
    throwing_axe: rangedClass({
        id: 'throwing_axe', type: 'ranged',
        damageType: 'physical',
        holdModes: ['one_handed'],
        damage: 6, range: 10,
        knockbackForce: 5, projectileSpeed: 15, projectileLifetime: 3,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 8,
        projectile: {kind: 'thrown_weapon', spin: true}, projectileGravityScale: 0.45,
        /* 蓄力：控制投掷远近 + 伤害 */
        charge: {maxChargeMultiplier: 140, maxChargeTime: 0.9, minSpeedScale: 0.45, maxSpeedScale: 1.7, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    grenade: rangedClass({
        id: 'grenade', type: 'ranged',
        damageType: 'physical',
        holdModes: ['one_handed'],
        damage: 4, range: 10,
        knockbackForce: 8, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 14, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 5, explosionRadius: 2.0,
        projectile: {kind: 'thrown_weapon', spin: true, explosionStyle: 'frag'}, projectileGravityScale: 0.55,
        charge: {maxChargeMultiplier: 135, maxChargeTime: 0.9, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    molotov: rangedClass({
        id: 'molotov', type: 'ranged',
        damageType: 'physical',
        holdModes: ['one_handed'],
        damage: 2, range: 10,
        knockbackForce: 5, projectileSpeed: 10, projectileLifetime: 4,
        detectionRange: 12, idealRange: 6, retreatRange: 3,
        throwAngle: Math.PI / 9, explosionRadius: 1.5,
        projectile: {kind: 'thrown_weapon', spin: true, explosionStyle: 'fire'}, projectileGravityScale: 0.5,
        charge: {maxChargeMultiplier: 135, maxChargeTime: 0.9, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
    throwing_dart: rangedClass({
        id: 'throwing_dart', type: 'ranged',
        damageType: 'physical',
        holdModes: ['one_handed'],
        damage: 1.5, range: 12,
        knockbackForce: 1, projectileSpeed: 30, projectileLifetime: 2,
        detectionRange: 16, idealRange: 8, retreatRange: 4,
        throwAngle: 0,
        projectile: {kind: 'thrown_weapon'}, projectileGravityScale: 0.2,
        charge: {maxChargeMultiplier: 140, maxChargeTime: 0.7, minSpeedScale: 0.5, maxSpeedScale: 1.6, minLifetimeScale: 0.8, maxLifetimeScale: 1.2},
    }),
}

/** 远程武器模型目录（键 = 模型 id；当前每类只有默认模型，模型 id = 类 id） */
export const RANGED_WEAPON_MODELS: Record<string, WeaponModelConfig> = {
    longbow: {
        id: 'longbow', classId: 'longbow', name: '长弓',
        mesh: { id: 'bow', size: 0.7, color: 0x886633, stringColor: 0xddddcc },
    },
    crossbow: {
        id: 'crossbow', classId: 'crossbow', name: '弩',
        mesh: { id: 'crossbow', size: 0.5, color: 0x553322, metalColor: 0x888888 },
    },
    shotgun: {
        id: 'shotgun', classId: 'shotgun', name: '霰弹枪',
        mesh: { id: 'shotgun', size: 0.6, color: 0x443322, metalColor: 0x666666 },
    },
    staff: {
        id: 'staff', classId: 'staff', name: '法杖',
        mesh: { id: 'staff', poleLen: 0.8, orbRadius: 0.12, color: 0x664422, orbColor: 0x44aaff },
    },
    magic_wand: {
        id: 'magic_wand', classId: 'magic_wand', name: '魔杖',
        mesh: { id: 'magic_wand', len: 0.5, color: 0x886633, gemColor: 0xff44ff },
    },
    throwing_axe: {
        id: 'throwing_axe', classId: 'throwing_axe', name: '飞斧',
        mesh: { id: 'throwing_axe', bladeSize: 0.25, color: 0x888888, gripColor: 0x553322 },
    },
    grenade: {
        id: 'grenade', classId: 'grenade', name: '手雷',
        mesh: { id: 'grenade', radius: 0.1, color: 0x445522, bandColor: 0x333311 },
    },
    molotov: {
        id: 'molotov', classId: 'molotov', name: '燃烧瓶',
        mesh: { id: 'molotov', size: 0.25, color: 0x446622, fireColor: 0xff8800 },
    },
    throwing_dart: {
        id: 'throwing_dart', classId: 'throwing_dart', name: '飞镖',
        mesh: { id: 'throwing_dart', len: 0.5, color: 0x888888, tailColor: 0xcc3333 },
    },
}

/** 合并武器类固有属性与模型，得到运行时 / 面板 / 存档统一使用的武器配置 */
export const resolveRangedWeapon = (model: WeaponModelConfig): RangedWeaponConfig => {
    const weaponClass = RANGED_WEAPON_CLASSES[model.classId]
    if (weaponClass === undefined) {
        throw new Error(`远程武器模型 ${model.id} 引用了未知武器类 ${model.classId}`)
    }
    /* 蓄力调参：武器模板默认，单武器（模型）可覆盖；覆写后同步重烘焙攻击链中可蓄力段的字段 */
    const charge: ProjectileChargeCurve | undefined = weaponClass.charge === undefined
        ? undefined
        : model.charge === undefined
            ? weaponClass.charge
            : {...weaponClass.charge, ...model.charge}
    return {
        ...weaponClass,
        charge,
        /* 仅在单武器有蓄力覆写时重烘焙攻击链（否则沿用类共享数据） */
        attacks: model.charge !== undefined && weaponClass.charge !== undefined && charge !== undefined
            ? withChargeTuningMap(weaponClass.attacks, charge)
            : weaponClass.attacks,
        classId: model.classId,
        id: model.id,
        name: model.name,
        mesh: model.mesh,
    }
}

/** 生产远程武器预设（当前 = 各类的默认模型解析结果；键 = 模型 id） */
export const RANGED_WEAPON_PRESETS: Record<string, RangedWeaponConfig> = Object.fromEntries(
    Object.entries(RANGED_WEAPON_MODELS).map(([id, model]) => [id, resolveRangedWeapon(model)]),
)
