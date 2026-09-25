import type {AttackKey, AttackSegment, AttackTransitionContext} from '../weapon/attack_chain.ts'
import {resolveEntrySegment} from '../weapon/attack_chain.ts'
import type {CombatComponent} from './types.ts'

/**
 * 攻击运行时辅助：段冷却读写 + 段转换上下文构造。
 * 冷却语义与原「起手冷却」一致 —— 从段触发时刻开始计时、只挡起手（链推进不查冷却）。
 */

/** 段冷却剩余（秒，<= 0 = 就绪） */
export const segmentCooldownRemaining = (c: CombatComponent, segmentId: string): number =>
    c.segmentCooldowns.get(segmentId) ?? 0

/** 段触发：挂上该段自身冷却（0 冷却不写入） */
export const armSegmentCooldown = (c: CombatComponent, segment: AttackSegment): void => {
    if (segment.cooldown > 0) c.segmentCooldowns.set(segment.id, segment.cooldown)
    else c.segmentCooldowns.delete(segment.id)
}

/** 逐帧递减全部段冷却（角色帧更新中调用，与状态无关） */
export const tickSegmentCooldowns = (c: CombatComponent, dt: number): void => {
    if (c.segmentCooldowns.size === 0) return
    for (const [segmentId, remaining] of c.segmentCooldowns) {
        const next = remaining - dt
        if (next <= 0) c.segmentCooldowns.delete(segmentId)
        else c.segmentCooldowns.set(segmentId, next)
    }
}

/** 构造段转换/起手解析上下文（输入侧信息 + 段冷却查询） */
export const attackContextOf = (
    c: CombatComponent,
    input: {readonly dx: number; readonly dz: number; readonly holdDuration: number; readonly attackKey: AttackKey | undefined},
): AttackTransitionContext => ({
    dx: input.dx,
    dz: input.dz,
    holdDuration: input.holdDuration,
    attackKey: input.attackKey,
    cooldownRemaining: (segmentId: string): number => segmentCooldownRemaining(c, segmentId),
})

/**
 * 攻击键能否起手（起手候选存在：守卫通过 + 冷却就绪）。
 * idle / walking 的 attacking 转换 guard 与玩家出招校验共用（无候选则不进入 attacking）。
 */
export const canStartAttack = (
    c: CombatComponent,
    input: {readonly dx: number; readonly dz: number; readonly holdDuration: number; readonly attackKey: AttackKey | undefined},
): boolean => {
    const key = input.attackKey
    if (key === undefined) return false
    return resolveEntrySegment(c.attacks, key, attackContextOf(c, input)) !== undefined
}
