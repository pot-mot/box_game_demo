import type {RapVector3} from '../../physics/rapier_utils.ts'
import type {CharacterEntity} from '../types.ts'
import type {WeaponType} from '../weapon/catalog.ts'
import type {CombatComponent} from './types.ts'

/** 执行器运行时上下文 —— 暴露必要能力，不依赖具体物理实现 */
export interface ExecutorContext {
    readonly fireProjectile: (
        source: CharacterEntity,
        direction: RapVector3,
        speed: number,
        damage: number,
        knockbackForce: number,
        lifetime: number,
    ) => void
}

/**
 * 技能执行器接口 —— 按**武器类型**（近战 / 远程）实现。
 * 执行器不接收「技能配置」：武器固有参数读 `combat.weapon`，当前动作段读 `combat.activeSegment`
 * （命中伤害 = weapon.damage × segment.damageMultiplier）。
 */
export interface SkillExecutor {
    readonly type: WeaponType

    /** 段开始执行（进入段时调用一次） */
    start(
        combat: CombatComponent,
        entity: CharacterEntity,
        direction: RapVector3,
        ctx: ExecutorContext,
    ): void

    /** 每帧更新（attacking 状态期间持续调用） */
    update(
        dt: number,
        combat: CombatComponent,
        entity: CharacterEntity,
        ctx: ExecutorContext,
    ): void

    /** 段结束（退出 attacking 状态时调用一次） */
    end(
        combat: CombatComponent,
        entity: CharacterEntity,
        ctx: ExecutorContext,
    ): void
}

/** 全局技能执行器注册表（键 = 武器类型） */
export const SKILL_EXECUTOR_REGISTRY = new Map<WeaponType, SkillExecutor>()

export const registerSkillExecutor = (type: WeaponType, executor: SkillExecutor): void => {
    SKILL_EXECUTOR_REGISTRY.set(type, executor)
}

export const getSkillExecutor = (type: WeaponType): SkillExecutor | undefined =>
    SKILL_EXECUTOR_REGISTRY.get(type)
