import type {StateHandler} from '../types.ts'
import type {CombatComponent} from '../../combat/types.ts'
import type {ComboGuardContext, SkillSlot} from '../../combat/skill_types.ts'
import {chainGroupOf, resolveChainNextIndex, resolveEntrySkillIndex} from '../../combat/combo_guard.ts'
import {SLOPE_WALK_THRESHOLD, SLOPE_TRANSIENT_MIN_NY} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, projectToSlopeAtSpeed, applySlopeAntiGravity, applySlopeSink} from '../ground.ts'
import {resolvePhases, phaseDurationOf} from '../../combat/attack_phases.ts'

/** 取近战段固有倾斜角（确定性，非随机） */
const segmentSwingTilt = (c: CombatComponent, skillIndex: number): number => {
    const skill = c.skills[skillIndex]
    if (skill?.config.type === 'melee') return skill.config.swingTilt ?? 0
    return 0
}

/** 技能总时长（动作 + 恢复）；无技能时 0 */
const skillDurationTotal = (skill: SkillSlot | undefined): number =>
    skill !== undefined ? skill.config.duration + skill.config.recovery : 0

/**
 * 解析缓冲目标：攻击键按下时决定段末要推进到哪个技能槽（reqKey = 攻击键组号）
 * - 同键组（当前链）→ 续链：comboChain 候选按声明顺序取守卫通过的下一段（方向/长按等条件分支），免冷却
 * - 异键组 → 切链：解析该键组起手槽（守卫 + 冷却），不切到自身
 * - 其余（无链/无候选/越界）→ 不缓冲
 */
const resolveBufferedSkillIndex = (c: CombatComponent, reqKey: number, ctx: ComboGuardContext): number => {
    if (c.skills[reqKey] === undefined) return -1
    if (reqKey === chainGroupOf(c)) return resolveChainNextIndex(c, ctx)
    if (!c.skills[reqKey].isChainEntry) return -1
    const idx = resolveEntrySkillIndex(c, reqKey, ctx)
    return idx !== c.currentSkillIndex ? idx : -1
}

/**
 * 阶段调度 meta-state — 统一入口，支持武器特定的阶段子状态委托。
 * 按阶段名查找已注册的 handler（key = "attacking_{skillId}_{phaseName}"），
 * 找到则委托执行，未找到则使用默认阶段行为。
 */

/** 阶段子状态 handler 注册表 — 外部通过 registerPhaseHandler 注入 */
export const phaseHandlerRegistry = new Map<string, StateHandler>()

export const registerPhaseHandler = (key: string, handler: StateHandler): void => {
    phaseHandlerRegistry.set(key, handler)
}

export const attackingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = true
        c.attackTimer = 0
        c.phaseIndex = 0
        c.phaseTimer = 0
        c.chainEntryIndex = c.currentSkillIndex
        c.bufferedSkillIndex = -1
        c.attackedTargets.clear()
        c.pendingFlinch = false
        c.swingTilt = segmentSwingTilt(c, c.currentSkillIndex)
        /* 冷却从触发时刻开始计时：起手段立即挂自身冷却（链中段冷却为 0，不受影响） */
        const skill = c.skills[c.currentSkillIndex]
        if (skill) skill.cooldownTimer = skill.config.cooldown
        entity.body.wakeUp()
    },
    update: (dt, input, entity) => {
        const c = entity.combat
        c.attackTimer += dt
        c.phaseTimer += dt

        const skill = c.skills[c.currentSkillIndex]
        if (!skill) return

        const phases = resolvePhases(skill.config.phases)

        /* 阶段推进（recovery 阶段时长取 config.recovery，动作阶段按 ratio 分摊 config.duration） */
        if (c.phaseIndex < phases.length) {
            const phase = phases[c.phaseIndex]
            const phaseDuration = phaseDurationOf(phase, skill.config.duration, skill.config.recovery)
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

        /* 缓冲写入：AI 侧按住 attack 持续写入；玩家侧由 setPlayerAttack 写单帧脉冲。
         * 逐帧按最新输入（方向/按住时长）重新求值守卫，新输入可覆写旧缓冲（中途改键/改方向 = 切链/换变体） */
        if (input.attack) {
            const resolved = resolveBufferedSkillIndex(
                c, input.skillIndex,
                {dx: input.dx, dz: input.dz, holdDuration: input.attackHoldDuration},
            )
            if (resolved >= 0) c.bufferedSkillIndex = resolved
        }

        /* 缓冲连段推进：最终阶段（recovery）完整播完后才消费缓冲，不检查冷却（冷却只挡起链） */
        if (c.phaseIndex >= phases.length && c.bufferedSkillIndex >= 0) {
            const nextIdx = c.bufferedSkillIndex
            const nextSkill = c.skills[nextIdx]
            if (nextSkill) {
                c.bufferedSkillIndex = -1
                c.currentSkillIndex = nextIdx
                if (nextSkill.isChainEntry) c.chainEntryIndex = nextIdx
                /* 冷却从触发时刻开始计时：链推进不查冷却，但新段触发即挂自身冷却（循环链回到起手槽 = 刷新冷却） */
                nextSkill.cooldownTimer = nextSkill.config.cooldown
                c.attackTimer = 0
                c.phaseIndex = 0
                c.phaseTimer = 0
                c.attackedTargets.clear()
                c.swingTilt = segmentSwingTilt(c, nextIdx)
                entity.body.wakeUp()
                return
            }
            c.bufferedSkillIndex = -1
        }

        /* 委托到阶段子状态 handler 或默认行为 */
        const phaseKey = c.phaseIndex < phases.length
            ? `attacking_${skill.config.id}_${phases[c.phaseIndex].name}`
            : undefined
        const phaseHandler = phaseKey ? phaseHandlerRegistry.get(phaseKey) : undefined

        if (phaseHandler) {
            /* 委托到武器特定阶段 handler */
            phaseHandler.update(dt, input, entity, {
                stateTime: c.phaseTimer,
                previousState: null,
                attackPhase: phases[c.phaseIndex].name,
            })
        } else {
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
        }
    },
    exit: (entity) => {
        const c = entity.combat
        c.attackActive = false
        c.bufferedSkillIndex = -1
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
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                if (!skill) return false
                const phases = resolvePhases(skill.config.phases)
                /* 阶段完成后还需技能总时长（动作 + 恢复）满足（防止 phases 和不等于 1 时提前逃逸） */
                if (entity.combat.phaseIndex >= phases.length) {
                    return entity.combat.attackTimer >= skill.config.duration + skill.config.recovery
                }
                return phases[entity.combat.phaseIndex].cancellable
            },
        },
        {
            to: 'walking',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                const phases = resolvePhases(skill?.config.phases)
                if (entity.combat.phaseIndex < phases.length) return false
                return entity.combat.attackTimer >= skillDurationTotal(skill)
                    && Math.hypot(input.dx, input.dz) > 0.001
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'idle',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                const phases = resolvePhases(skill?.config.phases)
                if (entity.combat.phaseIndex < phases.length) return false
                return entity.combat.attackTimer >= skillDurationTotal(skill)
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'jumping',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                const phases = resolvePhases(skill?.config.phases)
                if (entity.combat.phaseIndex < phases.length) return false
                return entity.combat.attackTimer >= skillDurationTotal(skill)
                    && input.jump
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'falling',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                const phases = resolvePhases(skill?.config.phases)
                if (entity.combat.phaseIndex < phases.length) return false
                return entity.combat.attackTimer >= skillDurationTotal(skill)
                    && shouldFall(entity)
            },
        },
    ],
}
