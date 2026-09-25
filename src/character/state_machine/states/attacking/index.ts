import type {CharacterInput, StateHandler} from '../../types.ts'
import type {CombatComponent} from '../../../combat/types.ts'
import {segmentTotalDuration} from '../../../weapon/attack_chain.ts'
import {resolvePhases} from '../../../combat/attack_phases.ts'
import {SLOPE_WALK_THRESHOLD, SLOPE_TRANSIENT_MIN_NY} from '../../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, projectToSlopeAtSpeed, applySlopeAntiGravity, applySlopeSink} from '../../ground.ts'
import {advanceSegmentPhases, enterAttackSegment, resolveSegmentNextState, type SegmentInput} from './segment.ts'

/**
 * attacking meta-state — 攻击段子状态的调度器。
 *
 * 结构（无槽位模型）：
 * - 进入 attacking 时由 `machine.ts` 完成**起手解析**（攻击键 → 起手候选守卫 + 冷却 → 段），
 *   本状态只负责初始化段子状态；
 * - 每帧：推进段子状态的阶段时间线 → 按输入求值**段自身的下一状态切换函数**
 *   （同键续链 / 异键切链起手）→ 段播完且有候选则进入下一段，否则维持当前段等待外层转换；
 * - 阶段特定逻辑仍可通过 `registerPhaseHandler('attacking_{segmentId}_{phaseName}')` 注入。
 */

/** 阶段子状态 handler 注册表 — 外部通过 registerPhaseHandler 注入 */
export const phaseHandlerRegistry = new Map<string, StateHandler>()

export const registerPhaseHandler = (key: string, handler: StateHandler): void => {
    phaseHandlerRegistry.set(key, handler)
}

/** 段输入快照（由 CharacterInput 转换） */
const segmentInputOf = (input: CharacterInput): SegmentInput => ({
    dx: input.dx,
    dz: input.dz,
    holdDuration: input.attackHoldDuration,
    attackKey: input.attackKey,
})

/** 段是否已完整播完（阶段全部结束且累计时间达到段总时长） */
const segmentFinished = (c: CombatComponent): boolean => {
    const segment = c.activeSegment
    if (segment === undefined) return true
    const phases = resolvePhases(segment.phases)
    if (c.phaseIndex < phases.length) return false
    return c.attackTimer >= segmentTotalDuration(segment)
}

export const attackingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = true
        c.bufferedSegment = undefined
        c.attackedTargets.clear()
        c.pendingFlinch = false
        const segment = c.activeSegment
        if (segment === undefined) return
        enterAttackSegment(c, segment, entity)
    },
    update: (dt, input, entity) => {
        const c = entity.combat
        const segment = c.activeSegment
        if (segment === undefined) return

        /* 段子状态推进：阶段时间线 + 段计时 */
        const phasesDone = advanceSegmentPhases(c, dt)

        /* 缓冲写入：AI 侧按住 attack 持续写入；玩家侧由 setPlayerAttack 写单帧脉冲。
         * 逐帧按最新输入（方向/按住时长/攻击键）重新求值段转换，新输入可覆写旧缓冲（中途改键/改方向 = 切链/换变体） */
        if (input.attack) {
            const next = resolveSegmentNextState(c, segment, segmentInputOf(input))
            if (next !== undefined) c.bufferedSegment = next
        }

        /* 段末推进：最终阶段（recovery）完整播完后才消费缓冲（段触发时已挂冷却，链推进不查冷却） */
        if (phasesDone && c.bufferedSegment !== undefined) {
            enterAttackSegment(c, c.bufferedSegment, entity)
            return
        }

        /* 委托到阶段子状态 handler 或默认行为 */
        const phases = resolvePhases(segment.phases)
        const phaseKey = c.phaseIndex < phases.length
            ? `attacking_${segment.id}_${phases[c.phaseIndex].name}`
            : undefined
        const phaseHandler = phaseKey ? phaseHandlerRegistry.get(phaseKey) : undefined

        if (phaseHandler) {
            /* 委托到武器特定阶段 handler */
            phaseHandler.update(dt, input, entity, {
                stateTime: c.phaseTimer,
                previousState: null,
                attackPhase: phases[c.phaseIndex].name,
            })
            return
        }

        /* 默认阶段行为：moveSpeedMultiplier 缩放输入驱动的移动速度（攻击中推进/突进）。
         * 无限连段下 AI 长期驻留 attacking，若只衰减存量速度会衰减到 0 且永不补充，
         * 导致攻击一段时间后站桩不动；无移动输入时才衰减残留速度（站桩出招） */
        const moveMul = c.phaseIndex < phases.length
            ? phases[c.phaseIndex].moveSpeedMultiplier
            : 0.3
        const inputLen = Math.hypot(input.dx, input.dz)
        if (inputLen > 0.001) {
            const speed = entity.config.speed * moveMul
            const dx = input.dx / inputLen
            const dz = input.dz / inputLen
            if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_WALK_THRESHOLD)) {
                /* 行走阈值以下接触：可能是瞬态棱法线伪影，同 walking 保留二级投影防甩离表面 */
                if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_TRANSIENT_MIN_NY)) {
                    const linvel = entity.body.linvel()
                    entity.body.setLinvel({x: dx * speed, y: linvel.y, z: dz * speed}, true)
                }
            } else {
                applySlopeSink(entity)
            }
        } else {
            const linvel = entity.body.linvel()
            if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
                entity.body.setLinvel({x: linvel.x * moveMul, y: linvel.y, z: linvel.z * moveMul}, true)
            } else {
                applySlopeAntiGravity(entity)
            }
        }
    },
    exit: (entity) => {
        const c = entity.combat
        c.attackActive = false
        c.bufferedSegment = undefined
        /* 冷却已在段触发时挂上，exit 不再补挂 */
    },
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
        },
        {
            to: 'dashing',
            guard: (input, entity) => {
                if (!input.sprint || entity.combat.dashSkill.cooldownTimer > 0) return false
                const segment = entity.combat.activeSegment
                if (segment === undefined) return false
                const phases = resolvePhases(segment.phases)
                /* 阶段完成后还需段总时长（动作 + 恢复）满足（防止 phases 和不等于 1 时提前逃逸） */
                if (entity.combat.phaseIndex >= phases.length) {
                    return entity.combat.attackTimer >= segmentTotalDuration(segment)
                }
                return phases[entity.combat.phaseIndex].cancellable
            },
        },
        {
            to: 'walking',
            guard: (input, entity) => {
                if (!segmentFinished(entity.combat)) return false
                return Math.hypot(input.dx, input.dz) > 0.001 && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'idle',
            guard: (_input, entity) => segmentFinished(entity.combat) && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'jumping',
            guard: (input, entity) =>
                segmentFinished(entity.combat) && input.jump && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity) => segmentFinished(entity.combat) && shouldFall(entity),
        },
    ],
}
