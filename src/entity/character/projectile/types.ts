import type RAPIER from '@dimforge/rapier3d-compat'
import type {Group, Mesh} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import type {ExplosionStyle} from '../../../character/weapon/projectile_visual.ts'
import type {DamageType} from '../../../character/combat/damage_type.ts'
import type {AttackTendency} from '../../../character/faction.ts'
import type {RapVector3} from '../../../physics/rapier_utils.ts'
import type {ProjectileTrail} from './trail.ts'

/** 弹丸朝向驱动方式 */
export const PROJECTILE_ORIENTATIONS = ['velocity', 'physics', 'none'] as const
export type ProjectileOrientation = typeof PROJECTILE_ORIENTATIONS[number]

/**
 * 弹丸视觉实例 —— 由 `mesh.ts` 的构建器产出，按视觉签名池化复用。
 * `group` 的世界位移由弹丸系统逐帧同步；朝向按 `orientation` 驱动。
 */
export interface ProjectileVisual {
    /** 视觉根节点（加入场景） */
    readonly group: Group
    /** 朝向驱动：沿速度 / 跟随物理旋转 / 不驱动 */
    readonly orientation: ProjectileOrientation
    /** 轨迹网格（世界坐标，非 group 子节点；无轨迹为 undefined） */
    readonly trailMesh: Mesh | undefined
    /** 轨迹实例（有轨迹时提供） */
    readonly trail: ProjectileTrail | undefined
    /** 逐帧外观动画（魔法球脉冲）；elapsed 为弹丸存活时间 */
    readonly animate: ((elapsed: number) => void) | undefined
    /** 释放资源（池销毁时调用） */
    readonly dispose: () => void
}

/**
 * 在飞弹丸记录 —— 物理刚体 / 碰撞体 / 视觉 / 数值全部在此。
 * 记录本身由系统池化复用，同一实例在不同时刻服务不同弹丸。
 */
export interface Projectile {
    readonly body: RAPIER.RigidBody
    readonly collider: RAPIER.Collider
    visual: ProjectileVisual | undefined
    ownerId: number
    ownerFaction: number
    ownerAttackTendency: AttackTendency
    damage: number
    damageType: DamageType
    knockbackForce: number
    lifetime: number
    homingStrength: number
    explosionRadius: number
    explosionStyle: ExplosionStyle
    /** 爆炸特效主色（魔法球取自身颜色，物理爆炸为火焰色） */
    explosionColor: number
    /** 命中闪光颜色 */
    impactColor: number
    /** 可穿过类别的位掩码（命中这些类别继续飞行） */
    passThroughMask: number
    /** 存活时间（秒，用于视觉脉冲） */
    elapsed: number
    /** 上一帧位置 —— 形状扫描起点 */
    prevX: number
    prevY: number
    prevZ: number
}

/** 生成一发弹丸的入参 */
export interface ProjectileSpawn {
    readonly owner: CharacterEntity
    /** 水平单位向量（x/z 已归一化，y 恒 0） */
    readonly direction: RapVector3
    /** 当前武器（含模型 / 视觉规格 / 弹道数值） */
    readonly weapon: RangedWeaponConfig
    /** 抛射仰角（rad） */
    readonly throwAngle: number
    /**
     * 蓄力值（0~1，仅玩家提供）：按武器 `charge` 曲线缩放初速 / 伤害 / 生命期。
     * 缺省（AI 或非蓄力武器）= 不缩放，使用武器预设值。
     */
    readonly charge?: number
}

/** 弹丸系统对外接口（由 `ranged_executor` 转发为主循环 updater 调用） */
export interface ProjectileSystem {
    /** 生成一发弹丸（含散布由调用方处理） */
    readonly spawn: (args: ProjectileSpawn) => void
    /** 每帧更新：生命期 / 制导 / 命中 / 引爆 / 特效 */
    readonly update: (dt: number, allCharacters: readonly CharacterEntity[]) => void
    /** 清除全部在飞弹丸与特效（世界还原 / 载入存档） */
    readonly clear: () => void
    /** 在飞弹丸数量 */
    readonly count: () => number
    /** 当前存活特效数量（测试用） */
    readonly effectCount: () => number
}
