import type { WeaponMeshConfig } from './mesh_config.ts'
import type { StringLocaleKey } from '../../i18n/index.ts'
import type { DamageType } from '../combat/damage_type.ts'
import type { ImpactLevel } from '../combat/impact.ts'
import type { CollisionCategory } from '../../physics/collision_category.ts'
import type { HoldMode } from './hold_mode.ts'
import type { HoldModeAttacks, WeaponAttacks } from './attack_chain.ts'
import { withAttackSlotKeyMap, withChargeTuningMap } from './attack_chain.ts'
import { buildRangedAttacks } from './ranged_attacks.ts'
import type { WeaponModelConfig } from './weapon_class.ts'
import type { ProjectileVisualSpec } from './projectile_visual.ts'
import type { ChargeTuning } from './charge_tuning.ts'

/** 吐息机制类型（龙专属装备） */
export const BREATH_KINDS = ['fireball', 'lightning', 'laser'] as const
export type BreathKind = typeof BREATH_KINDS[number]

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
    /** 天然武器类别（如吐息）：无可视模型、无动画关键帧数据，动作由所属**体形分包**提供 */
    readonly natural?: boolean
    /** 武器挂点关节 id（可选；仅生物体形使用）：覆盖体形默认主挂点。缺省 = 默认主挂点 */
    readonly mountJointId?: string
    /** 生物武器挂点局部欧拉角（可选；如狼口含剑横置）；缺省 = 体形默认握持姿态 */
    readonly mountRotation?: readonly [number, number, number]
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
    /** 爆炸冲击力（缺省 = 常量 `EXPLOSION_DEFAULT_IMPACT`；爆炸为范围冲击，通常为倒地级） */
    readonly explosionImpact?: ImpactLevel
    /** 爆炸削韧值（缺省 = 常量 `EXPLOSION_DEFAULT_POISE_DAMAGE`） */
    readonly explosionPoise?: number
    readonly homingStrength?: number
    readonly throwAngle?: number
    /** 吐息机制（仅吐息模组声明）：火球 / 雷电 / 激光 */
    readonly breathKind?: BreathKind
    /** 雷电链式传导：额外目标数 / 搜索半径 / 每跳伤害衰减 */
    readonly chainCount?: number
    readonly chainRadius?: number
    readonly chainFalloff?: number
    /** 激光穿透角色数（命中后继续飞行） */
    readonly pierceCount?: number
    /**
     * 子弹可穿过的碰撞类别列表（默认 `DEFAULT_BULLET_PASS_THROUGH_CATEGORIES` = 仅 area）：
     * 命中列表内类别的物体时子弹继续飞行，命中其它类别（角色 / 箱子 / 碎片 / 地形 / 世界地面）即消失。
     */
    readonly passThroughCategories?: readonly CollisionCategory[]

    /** 持握模式 → 攻击链 map（单段开火动作：阶段时序/时长） */
    readonly attacks: HoldModeAttacks
}

/** 解析后的远程武器 = 武器类固有属性 + 所属模型（模型 id / 体形 / 名称 / 网格） */
export interface RangedWeaponConfig extends RangedWeaponClassConfig {
    /** 所属武器类 id（双持同类判定用；见 catalog.ts 的 sameWeaponClass） */
    readonly classId: string
    /** 所属体形 id（`BodyForm.id`）；武器只对应一种体形 */
    readonly formId: string
    /** 武器中文名（面向玩家显示，如面板武器下拉、展示场景标签） */
    readonly name: string
    /** 武器名本地化键（UI 展示统一经此取用） */
    readonly nameKey: StringLocaleKey
    /** 该武器可装备的部位 id（体形 `EquipSlotDef.bodyPart`） */
    readonly equipBodyParts: readonly string[]
    /** 程序化武器模型（主手 / 右手） */
    readonly mesh: WeaponMeshConfig
}

/**
 * 远程武器类装配：按默认持握模式注入固有开火动作链。
 * 由各体形的 `weapons.ts` 调用（武器类数据由所属体形拥有）。
 */
export const rangedClass = (
    base: Omit<RangedWeaponClassConfig, 'attacks'>,
    attackKey: 'light' | 'heavy' = 'light',
): RangedWeaponClassConfig => {
    const attacks: Partial<Record<HoldMode, WeaponAttacks>> = {}
    attacks[base.holdModes[0]] = buildRangedAttacks(base.id, base.charge, attackKey)
    return {...base, attacks}
}

/** 合并远程武器类固有属性与模型，得到运行时 / 面板 / 存档统一使用的武器配置 */
export const resolveRangedWeapon = (weaponClass: RangedWeaponClassConfig, model: WeaponModelConfig): RangedWeaponConfig => {
    /* 蓄力调参：武器模板默认，单武器（模型）可覆盖；覆写后同步重烘焙攻击链中可蓄力段的字段 */
    const charge: ProjectileChargeCurve | undefined = weaponClass.charge === undefined
        ? undefined
        : model.charge === undefined
            ? weaponClass.charge
            : {...weaponClass.charge, ...model.charge}
    const slotKey = model.equipBodyParts[0]
    const attacks = model.charge !== undefined && weaponClass.charge !== undefined && charge !== undefined
        ? withChargeTuningMap(weaponClass.attacks, charge)
        : weaponClass.attacks
    return {
        ...weaponClass,
        charge,
        /* 仅在单武器有蓄力覆写时重烘焙攻击链（否则沿用类共享数据） */
        attacks: slotKey !== undefined ? withAttackSlotKeyMap(attacks, `weapon:${slotKey}`) : attacks,
        classId: model.classId,
        id: model.id,
        formId: model.formId,
        name: model.name,
        nameKey: model.nameKey,
        equipBodyParts: model.equipBodyParts,
        mesh: model.mesh,
    }
}
