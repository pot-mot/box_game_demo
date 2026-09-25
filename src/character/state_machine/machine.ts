import type {CharacterEntity} from '../types.ts'
import {resolvePhases} from '../combat/attack_phases.ts'
import {resolveEntrySegment} from '../weapon/attack_chain.ts'
import {attackContextOf} from '../combat/attack_runtime.ts'
import type {
    CharacterState,
    CharacterInput,
    CharacterStateMachine,
    MachineContext,
    StateHandler,
} from './types.ts'
import {idleHandler} from './states/idle.ts'
import {walkingHandler} from './states/walking.ts'
import {jumpingHandler} from './states/jumping.ts'
import {fallingHandler} from './states/falling.ts'
import {attackingHandler} from './states/attacking/index.ts'
import {dyingHandler} from './states/dying.ts'
import {dashingHandler} from './states/dashing.ts'
import {flinchingHandler} from './states/flinching.ts'
import {updateGroundTimers} from './ground.ts'

const STATE_HANDLERS: Record<CharacterState, StateHandler> = {
    idle: idleHandler,
    walking: walkingHandler,
    jumping: jumpingHandler,
    falling: fallingHandler,
    attacking: attackingHandler,
    dying: dyingHandler,
    dashing: dashingHandler,
    flinching: flinchingHandler,
}

export const createCharacterStateMachine = (): CharacterStateMachine => {
    let currentState: CharacterState = 'idle'
    let previousState: CharacterState | null = null
    let stateTime = 0
    let onStateChange: ((from: CharacterState, to: CharacterState) => void) | null = null
    const input: CharacterInput = {dx: 0, dz: 0, jump: false, attack: false, attackKey: undefined, sprint: false, attackHoldDuration: 0}

    const makeContext = (entity?: CharacterEntity): MachineContext => {
        let attackPhase: string | undefined
        if (entity !== undefined && currentState === 'attacking') {
            const segment = entity.combat.activeSegment
            if (segment !== undefined) {
                const phases = resolvePhases(segment.phases)
                if (entity.combat.phaseIndex < phases.length) {
                    attackPhase = phases[entity.combat.phaseIndex].name
                }
            }
        }
        return {
            stateTime,
            previousState,
            attackPhase,
        }
    }

    const setInput = (dx: number, dz: number, jump: boolean, attack: boolean, sprint?: boolean, attackKey?: CharacterInput['attackKey'], attackHoldDuration?: number): void => {
        input.dx = dx
        input.dz = dz
        input.jump = jump
        input.attack = attack
        input.sprint = sprint ?? false
        input.attackKey = attackKey
        input.attackHoldDuration = attackHoldDuration ?? 0
    }

    const update = (dt: number, entity: CharacterEntity): void => {
        const handler = STATE_HANDLERS[currentState]
        const ctx = makeContext(entity)
        updateGroundTimers(entity, dt)

        for (const t of handler.transitions) {
            if (t.guard(input, entity, ctx)) {
                handler.exit(entity, ctx)
                previousState = currentState
                currentState = t.to
                stateTime = 0
                if (currentState === 'attacking') {
                    /* 起手解析：攻击键的起手候选按守卫（蓄力/方向变体）+ 冷却解析（转换 guard 已验证存在候选） */
                    const key = input.attackKey
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
                STATE_HANDLERS[currentState].enter(entity, newCtx)
                onStateChange?.(previousState, currentState)
                return
            }
        }

        stateTime += dt
        STATE_HANDLERS[currentState].update(dt, input, entity, makeContext(entity))
    }

    const reset = (): void => {
        currentState = 'idle'
        previousState = null
        stateTime = 0
        input.dx = 0
        input.dz = 0
        input.jump = false
        input.attack = false
        input.sprint = false
        input.attackKey = undefined
        input.attackHoldDuration = 0
    }

    return {
        get currentState() { return currentState },
        get previousState() { return previousState },
        get stateTime() { return stateTime },
        get onStateChange() { return onStateChange },
        set onStateChange(v) { onStateChange = v },
        setInput,
        update,
        reset,
    }
}
