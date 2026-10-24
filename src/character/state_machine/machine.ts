import type {CharacterEntity} from '../types.ts'
import {resolvePhases} from '../combat/attack_phases.ts'
import {resolveEntrySegment} from '../weapon/attack_chain.ts'
import {attackContextOf} from '../combat/attack_runtime.ts'
import type {
    CharacterStateName,
    CharacterInput,
    CharacterStateMachine,
    MachineContext,
    StateHandler,
} from './types.ts'
import {createCharacterStateMachineData, type CharacterStateMachineData} from '../state/types.ts'
import {idleHandler} from './states/idle.ts'
import {walkingHandler} from './states/walking.ts'
import {jumpingHandler} from './states/jumping.ts'
import {fallingHandler} from './states/falling.ts'
import {swimmingHandler} from './states/swimming.ts'
import {floatingHandler} from './states/floating.ts'
import {attackingHandler} from './states/attacking/index.ts'
import {airAttackingHandler} from './states/air_attacking.ts'
import {dyingHandler} from './states/dying.ts'
import {rollingHandler} from './states/rolling.ts'
import {flinchingHandler} from './states/flinching.ts'
import {interactingHandler} from './states/interacting.ts'
import {knockdownHandler} from './states/knockdown.ts'
import {gettingUpHandler} from './states/getting_up.ts'
import {blockingHandler} from './states/blocking.ts'
import {guardBrokenHandler} from './states/guard_broken.ts'
import {updateGroundTimers} from './ground.ts'

const STATE_HANDLERS: Record<CharacterStateName, StateHandler> = {
    idle: idleHandler,
    walking: walkingHandler,
    jumping: jumpingHandler,
    falling: fallingHandler,
    swimming: swimmingHandler,
    floating: floatingHandler,
    attacking: attackingHandler,
    air_attacking: airAttackingHandler,
    dying: dyingHandler,
    rolling: rollingHandler,
    flinching: flinchingHandler,
    interacting: interactingHandler,
    knockdown: knockdownHandler,
    getting_up: gettingUpHandler,
    blocking: blockingHandler,
    guard_broken: guardBrokenHandler,
}

export const createCharacterStateMachine = (
    data: CharacterStateMachineData = createCharacterStateMachineData(),
): CharacterStateMachine => {
    let onStateChange: ((from: CharacterStateName, to: CharacterStateName) => void) | null = null
    const input: CharacterInput = {dx: 0, dz: 0, jump: false, attack: false, attackKey: undefined, roll: false, attackHoldDuration: 0, attackHeld: false, interact: false, block: false, swimLift: 0}

    const makeContext = (entity?: CharacterEntity): MachineContext => {
        let attackPhase: string | undefined
        if (entity !== undefined && (data.currentState === 'attacking' || data.currentState === 'air_attacking')) {
            const segment = entity.combat.activeSegment
            if (segment !== undefined) {
                const phases = resolvePhases(segment.phases)
                if (entity.combat.phaseIndex < phases.length) {
                    attackPhase = phases[entity.combat.phaseIndex].name
                }
            }
        }
        return {
            stateTime: data.stateTime,
            previousState: data.previousState,
            attackPhase,
        }
    }

    const setInput = (dx: number, dz: number, jump: boolean, attack: boolean, roll?: boolean, attackKey?: CharacterInput['attackKey'], attackHoldDuration?: number, attackHeld?: boolean, interact?: boolean, block?: boolean, swimLift?: number): void => {
        input.dx = dx
        input.dz = dz
        input.jump = jump
        input.attack = attack
        input.roll = roll ?? false
        input.attackKey = attackKey
        input.attackHoldDuration = attackHoldDuration ?? 0
        input.attackHeld = attackHeld ?? false
        input.interact = interact ?? false
        input.block = block ?? false
        input.swimLift = swimLift ?? 0
    }

    const update = (dt: number, entity: CharacterEntity): void => {
        const handler = STATE_HANDLERS[data.currentState]
        const ctx = makeContext(entity)
        updateGroundTimers(entity, dt)
        /* 格挡保持：统一由输入同步到战斗组件，供 blocking 状态守卫与盾判定读取 */
        entity.combat.blockHeld = input.block

        /* 全局倒地：任意非死亡 / 非倒地状态在韧性归零或受 knockdown 冲击时强制进入 knockdown（dying 优先级最高） */
        if (
            entity.combat.pendingKnockdown
            && entity.combat.health > 0
            && data.currentState !== 'dying'
            && data.currentState !== 'knockdown'
            && data.currentState !== 'getting_up'
        ) {
            handler.exit(entity, ctx)
            data.previousState = data.currentState
            data.currentState = 'knockdown'
            data.stateTime = 0
            STATE_HANDLERS[data.currentState].enter(entity, makeContext(entity))
            onStateChange?.(data.previousState, data.currentState)
            return
        }

        /* 全局破防：持盾且格挡槽归零时强制进入 guard_broken（倒地 / 起身与死亡优先级更高，不受此约束） */
        if (
            entity.combat.block !== undefined
            && entity.combat.guard <= 0
            && entity.combat.health > 0
            && data.currentState !== 'dying'
            && data.currentState !== 'knockdown'
            && data.currentState !== 'getting_up'
            && data.currentState !== 'guard_broken'
        ) {
            handler.exit(entity, ctx)
            data.previousState = data.currentState
            data.currentState = 'guard_broken'
            data.stateTime = 0
            STATE_HANDLERS[data.currentState].enter(entity, makeContext(entity))
            onStateChange?.(data.previousState, data.currentState)
            return
        }

        for (const t of handler.transitions) {
            if (t.guard(input, entity, ctx)) {
                handler.exit(entity, ctx)
                data.previousState = data.currentState
                data.currentState = t.to
                data.stateTime = 0
                if (data.currentState === 'attacking' || data.currentState === 'air_attacking') {
                    /* 起手解析：攻击键的起手候选按守卫（蓄力/方向变体）+ 冷却解析（转换 guard 已验证存在候选）；
                     * 空中攻击固定走 `air` 链（与地面轻重链分离） */
                    const key = data.currentState === 'air_attacking' ? 'air' : input.attackKey
                    entity.combat.activeSegment = key !== undefined
                        ? resolveEntrySegment(
                            entity.combat.attacks,
                            key,
                            attackContextOf(entity.combat, {
                                dx: input.dx,
                                dz: input.dz,
                                holdDuration: input.attackHoldDuration,
                                attackKey: key,
                            }),
                        )
                        : undefined
                }
                const newCtx = makeContext(entity)
                STATE_HANDLERS[data.currentState].enter(entity, newCtx)
                onStateChange?.(data.previousState, data.currentState)
                return
            }
        }

        data.stateTime += dt
        STATE_HANDLERS[data.currentState].update(dt, input, entity, makeContext(entity))
    }

    const reset = (): void => {
        data.currentState = 'idle'
        data.previousState = null
        data.stateTime = 0
        input.dx = 0
        input.dz = 0
        input.jump = false
        input.attack = false
        input.roll = false
        input.attackKey = undefined
        input.attackHoldDuration = 0
        input.attackHeld = false
        input.interact = false
        input.block = false
        input.swimLift = 0
    }

    return {
        get currentState() { return data.currentState },
        get previousState() { return data.previousState },
        get stateTime() { return data.stateTime },
        get onStateChange() { return onStateChange },
        set onStateChange(v) { onStateChange = v },
        setInput,
        update,
        reset,
    }
}
