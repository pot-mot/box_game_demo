import type {DamageType} from './damage_type.ts'

/**
 * 攻击来源类别 —— 区别于伤害类别（物理 / 魔法）：表达「由哪种玩法行为造成」，
 * 供可破坏场景道具按来源过滤（如「只能被近战破坏」）。
 */
export const ATTACK_SOURCE_KINDS = ['melee', 'ranged', 'explosion', 'roll'] as const
export type AttackSourceKind = typeof ATTACK_SOURCE_KINDS[number]

/**
 * 世界受击目标（可破坏场景道具等）——由实体系统注册给角色系统，
 * 近战 / 远程 / 爆炸 / 翻滚命中路径据此判定与投递伤害。
 */
export interface WorldDamageTarget {
    /** 全局唯一键（交互物用 -entityId，避免与角色 id 冲突） */
    readonly key: number
    readonly x: number
    readonly y: number
    readonly z: number
    /** 轴对齐受击箱半长 */
    readonly hx: number
    readonly hy: number
    readonly hz: number
    /** 受击箱绕 Y 轴朝向（弧度） */
    readonly yaw: number
    readonly dead: boolean
    /** 命中：自行按 source 与可破坏来源决定是否扣血；返回是否消费本次命中 */
    onAttacked: (source: AttackSourceKind, damageType: DamageType, amount: number, dirX: number, dirZ: number) => boolean
}

export type WorldDamageTargetProvider = () => readonly WorldDamageTarget[]
