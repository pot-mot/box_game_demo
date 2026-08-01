import type { Vec3 } from 'cannon-es'
import type { CharacterEntity } from '../types.ts'
import type { CombatComponent } from './types.ts'
import type { SkillConfig, SkillType } from './skill_types.ts'

/** 执行器运行时上下文 — 暴露必要能力，不依赖具体物理实现 */
export interface ExecutorContext {
    readonly fireProjectile: (
        source: CharacterEntity,
        direction: Vec3,
        speed: number,
        damage: number,
        knockbackForce: number,
        lifetime: number,
    ) => void
}

/** 技能执行器接口 — 近战/远程各自实现 */
export interface SkillExecutor {
    readonly type: SkillType

    /** 技能开始执行（进入 attacking 状态时调用一次） */
    start(
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        direction: Vec3,
        ctx: ExecutorContext,
    ): void

    /** 每帧更新（attacking 状态期间持续调用） */
    update(
        dt: number,
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        ctx: ExecutorContext,
    ): void

    /** 技能结束（退出 attacking 状态时调用一次） */
    end(
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        ctx: ExecutorContext,
    ): void
}

/** 全局技能执行器注册表 */
export const SKILL_EXECUTOR_REGISTRY = new Map<SkillType, SkillExecutor>()

export const registerSkillExecutor = (type: SkillType, executor: SkillExecutor): void => {
    SKILL_EXECUTOR_REGISTRY.set(type, executor)
}

export const getSkillExecutor = (type: SkillType): SkillExecutor | undefined =>
    SKILL_EXECUTOR_REGISTRY.get(type)
