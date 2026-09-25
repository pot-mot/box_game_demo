import type {CharacterEntity} from '../types.ts'
import type {AttackKey} from '../weapon/attack_chain.ts'

export const CHARACTER_STATES = ['idle', 'walking', 'jumping', 'falling', 'attacking', 'dying', 'dashing', 'flinching'] as const
export type CharacterState = typeof CHARACTER_STATES[number]

export interface CharacterInput {
    dx: number
    dz: number
    jump: boolean
    attack: boolean
    /** 攻击键组（light = 轻击键 / heavy = 重击键；undefined = 本帧未按攻击键） */
    attackKey: AttackKey | undefined
    sprint: boolean
    /** 攻击键按住时长（秒，仅 attack 为真的脉冲帧有意义）：连段守卫用它区分点按/长按（蓄力） */
    attackHoldDuration: number
}

export interface MachineContext {
    readonly stateTime: number
    readonly previousState: CharacterState | null
    /** 当前攻击阶段名（仅在 attacking 状态期间有效，其他状态为 undefined） */
    readonly attackPhase: string | undefined
}

export interface Transition {
    to: CharacterState
    guard: (input: CharacterInput, entity: CharacterEntity, ctx: MachineContext) => boolean
}

export interface StateHandler {
    enter: (entity: CharacterEntity, ctx: MachineContext) => void
    update: (dt: number, input: CharacterInput, entity: CharacterEntity, ctx: MachineContext) => void
    exit: (entity: CharacterEntity, ctx: MachineContext) => void
    transitions: readonly Transition[]
}

export interface CharacterStateMachine {
    readonly currentState: CharacterState
    readonly previousState: CharacterState | null
    readonly stateTime: number
    onStateChange: ((from: CharacterState, to: CharacterState) => void) | null

    setInput(dx: number, dz: number, jump: boolean, attack: boolean, sprint?: boolean, attackKey?: AttackKey, attackHoldDuration?: number): void
    update(dt: number, entity: CharacterEntity): void
    reset(): void
}
