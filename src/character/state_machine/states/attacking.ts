import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, applySlopeAntiGravity} from '../ground.ts'
import {resolvePhases, COMBO_WINDOW} from '../../combat/attack_phases.ts'

/**
 * 连招倾斜角序列（rad，0=垂直劈，±PI/2=横斩）：
 * 右上斜劈 → 左横斩 → 右横斩 → 近垂直竖劈 循环。
 * 全部角度限在 (-PI/2, PI/2) 内，保证 cos>0（蓄力后摆、挥砍前挥），
 * 且 sin 分量提供左右方向——超出 ±90° 会把挥砍反向成后拉。
 */
/** （导出供展示场景等复用，单一数据源） */
export const COMBO_TILT_TABLE = [Math.PI * 0.15, -Math.PI * 0.4, Math.PI * 0.45, Math.PI * 0.08] as const

const nextComboTilt = (c: {swingCount: number}): number =>
    COMBO_TILT_TABLE[c.swingCount % COMBO_TILT_TABLE.length]

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
        c.comboIndex = 0
        c.comboTimer = COMBO_WINDOW
        c.attackedTargets.clear()
        c.pendingFlinch = false
        const skill = c.skills[c.currentSkillIndex]
        if (skill?.config.type === 'melee') {
            c.swingTilt = nextComboTilt(c)
            c.swingCount++
        } else {
            c.swingTilt = 0
        }
        entity.body.wakeUp()
    },
    update: (dt, input, entity) => {
        const c = entity.combat
        c.attackTimer += dt
        c.phaseTimer += dt

        const skill = c.skills[c.currentSkillIndex]
        if (!skill) return

        /* 连招窗口倒计时 */
        c.comboTimer = Math.max(0, c.comboTimer - dt)

        const phases = resolvePhases(skill.config.phases)

        /* 阶段推进 */
        if (c.phaseIndex < phases.length) {
            const phase = phases[c.phaseIndex]
            const phaseDuration = skill.config.duration * phase.durationRatio
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

        /* 连招推进：当前阶段可取消且有攻击输入且窗口未关闭 */
        if (c.phaseIndex < phases.length) {
            const phase = phases[c.phaseIndex]
            if (phase.cancellable && input.attack && c.comboTimer > 0) {
                const comboChain = c.skills[c.currentSkillIndex]?.comboChain
                if (comboChain && c.comboIndex < comboChain.length) {
                    const nextSkillId = comboChain[c.comboIndex]
                    const nextIdx = c.skills.findIndex(s => s.config.id === nextSkillId)
                    if (nextIdx !== -1 && c.skills[nextIdx].cooldownTimer <= 0) {
                        /* 当前技能进入冷却 */
                        skill.cooldownTimer = skill.config.cooldown
                        /* 连招推进到下一技能 */
                        c.currentSkillIndex = nextIdx
                        c.comboIndex = 0
                        c.attackTimer = 0
                        c.phaseIndex = 0
                        c.phaseTimer = 0
                        c.comboTimer = COMBO_WINDOW
                        c.attackedTargets.clear()
                        const nextSkill = c.skills[nextIdx]
                        if (nextSkill?.config.type === 'melee') {
                            c.swingTilt = nextComboTilt(c)
                            c.swingCount++
                        } else {
                            c.swingTilt = 0
                        }
                        entity.body.wakeUp()
                        return
                    }
                }
            }
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
            /* 默认阶段行为 */
            const moveMul = c.phaseIndex < phases.length
                ? phases[c.phaseIndex].moveSpeedMultiplier
                : 0.3
            const linvel = entity.body.linvel()
            const vx = linvel.x * moveMul
            const vz = linvel.z * moveMul
            if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
                entity.body.setLinvel({x: vx, y: linvel.y, z: vz}, true)
            } else {
                applySlopeAntiGravity(entity)
            }
        }
    },
    exit: (entity) => {
        const c = entity.combat
        c.attackActive = false
        const skill = c.skills[c.currentSkillIndex]
        if (skill) skill.cooldownTimer = skill.config.cooldown
        /* 连招终止时重置索引；正常退出时 comboIndex 由连招推进逻辑维护 */
        if (c.comboTimer <= 0) {
            c.comboIndex = 0
        }
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
                if (!input.sprint || entity.dashCooldownTimer > 0) return false
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                if (!skill) return false
                const phases = resolvePhases(skill.config.phases)
                /* 阶段完成后还需攻击总时长满足 duration（防止 phases 和不等于 1 时提前逃逸） */
                if (entity.combat.phaseIndex >= phases.length) {
                    return entity.combat.attackTimer >= skill.config.duration
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
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
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
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'jumping',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                const phases = resolvePhases(skill?.config.phases)
                if (entity.combat.phaseIndex < phases.length) return false
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
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
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && shouldFall(entity)
            },
        },
    ],
}
