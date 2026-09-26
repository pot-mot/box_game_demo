import type {CharacterEntity} from '../../../types.ts'
import type {AttackKey, AttackSegment} from '../../../weapon/attack_chain.ts'
import {resolveEntrySegment, resolveNextSegment} from '../../../weapon/attack_chain.ts'
import type {CombatComponent} from '../../../combat/types.ts'
import {armSegmentCooldown, attackContextOf} from '../../../combat/attack_runtime.ts'
import {resolvePhases, phaseDurationOf} from '../../../combat/attack_phases.ts'

/**
 * 攻击段子状态 —— attacking meta-state 的子状态单元。
 *
 * 每个段子状态负责两件事：
 * 1. **阶段时间线推进**（动作阶段按 ratio 分摊 duration，recovery 阶段时长取段 recovery）；
 * 2. **自身的下一状态切换函数**（`resolveSegmentNextState`）—— 连段由武器模组在段定义里声明的
 *    `next` 转换（含守卫变体）决定，状态机不持有任何槽位/连段索引。
 */

/** 输入侧快照（段转换求值用） */
export interface SegmentInput {
    readonly dx: number
    readonly dz: number
    readonly holdDuration: number
    readonly attackKey: AttackKey | undefined
}

/** 进入攻击段：重置计时/阶段、挂段冷却、清空命中记录并唤醒刚体（动画取段 id 的骨骼关键帧数据） */
export const enterAttackSegment = (c: CombatComponent, segment: AttackSegment, entity: CharacterEntity): void => {
    c.activeSegment = segment
    c.bufferedSegment = undefined
    c.attackTimer = 0
    c.phaseIndex = 0
    c.phaseTimer = 0
    c.attackedTargets.clear()
    /* 冷却从触发时刻开始计时（链中段冷却为 0，不受影响） */
    armSegmentCooldown(c, segment)
    entity.body.wakeUp()
}

/** 阶段时间线推进（含段计时累加）；返回是否已播完全部阶段（含恢复段） */
export const advanceSegmentPhases = (c: CombatComponent, dt: number): boolean => {
    const segment = c.activeSegment
    if (segment === undefined) return true
    c.attackTimer += dt
    c.phaseTimer += dt

    const phases = resolvePhases(segment.phases)
    if (c.phaseIndex < phases.length) {
        const phase = phases[c.phaseIndex]
        const phaseDuration = phaseDurationOf(phase, segment.duration, segment.recovery)
        if (c.phaseTimer >= phaseDuration) {
            if (c.phaseIndex < phases.length - 1) {
                c.phaseIndex++
                c.phaseTimer = 0
            } else {
                /* 最终阶段完成，标记所有阶段已结束 */
                c.phaseIndex = phases.length
            }
        }
    }
    return c.phaseIndex >= phases.length
}

/** 当前段是否已完整播完（仅阶段判定，不含外层状态机的总时长条件） */
export const isSegmentPhasesDone = (c: CombatComponent): boolean => {
    const segment = c.activeSegment
    if (segment === undefined) return true
    return c.phaseIndex >= resolvePhases(segment.phases).length
}

/**
 * 段子状态的下一状态切换函数：
 * - **同键**（按下的攻击键 = 当前段所属键）→ 本段声明的 `next` 转换（守卫变体优先，链终止则无候选）；
 * - **异键** → 该攻击键的起手解析（起手候选守卫 + 冷却；不切到自身）；
 * - 未按攻击键 → 无候选（保持当前段，是否退出 attacking 由外层状态机决定）。
 */
export const resolveSegmentNextState = (
    c: CombatComponent,
    segment: AttackSegment,
    input: SegmentInput,
): AttackSegment | undefined => {
    if (input.attackKey === undefined) return undefined
    const ctx = attackContextOf(c, input)
    return input.attackKey === segment.key
        ? resolveNextSegment(c.attacks, segment, ctx)
        : resolveEntrySegment(c.attacks, input.attackKey, ctx, segment.id)
}
