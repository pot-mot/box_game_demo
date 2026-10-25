import type {CharacterEntity} from '../types.ts'
import type {AttackKey} from '../weapon/attack_chain.ts'
import type {CharacterStateName} from './state_names.ts'

export {
    CHARACTER_STATES,
    ATTACK_STATES,
    BASE_CLIP_STATES,
    isAttackState,
    type CharacterStateName,
    type AttackState,
    type BaseClipState,
} from './state_names.ts'

export interface CharacterInput {
    dx: number
    dz: number
    jump: boolean
    attack: boolean
    /** 攻击键组（light = 轻击键 / heavy = 重击键；undefined = 本帧未按攻击键） */
    attackKey: AttackKey | undefined
    /** 翻滚触发（本帧按下移动技能键） */
    roll: boolean
    /** 攻击键按住时长（秒，仅 attack 为真的脉冲帧有意义）：连段守卫用它区分点按/长按（蓄力） */
    attackHoldDuration: number
    /**
     * 攻击键当前是否处于按住状态（持续为真，非脉冲）：远程蓄力段用它冻结在 `chargeable`
     * 阶段起始帧并累积蓄力，松开后继续推进。AI 恒 false。
     */
    attackHeld: boolean
    /** 交互触发（本帧按下交互键，且存在可交互目标） */
    interact: boolean
    /**
     * 格挡保持（逐帧写入，供状态机守卫）：玩家长按盾攻击键超过阈值、或 AI 反应式举盾时为真。
     * 由 `machine.ts` 每帧同步到 `entity.combat.blockHeld`，`blocking` 状态据此维持。
     */
    block: boolean
    /** 游泳竖直意图（-1..1 = 镜头前向垂直分量 × 前后输入；0 = 无。仅游泳状态消费） */
    swimLift: number
    /** 跑步保持（逐帧写入：长按翻滚键且未在翻滚 / 格挡等状态时消费） */
    sprint: boolean
    /** 飞行切换（本帧双击跳跃键的边沿；进入 / 退出飞行） */
    fly: boolean
    /** 飞行升降意图（-1..1：Z 上升 / X 下降；0 = 悬停） */
    flyLift: number
}

export interface MachineContext {
    readonly stateTime: number
    readonly previousState: CharacterStateName | null
    /** 当前攻击阶段名（仅在 attacking 状态期间有效，其他状态为 undefined） */
    readonly attackPhase: string | undefined
}

export interface Transition {
    to: CharacterStateName
    guard: (input: CharacterInput, entity: CharacterEntity, ctx: MachineContext) => boolean
}

export interface StateHandler {
    enter: (entity: CharacterEntity, ctx: MachineContext) => void
    update: (dt: number, input: CharacterInput, entity: CharacterEntity, ctx: MachineContext) => void
    exit: (entity: CharacterEntity, ctx: MachineContext) => void
    transitions: readonly Transition[]
}

export interface CharacterStateMachine {
    readonly currentState: CharacterStateName
    readonly previousState: CharacterStateName | null
    readonly stateTime: number
    onStateChange: ((from: CharacterStateName, to: CharacterStateName) => void) | null

    setInput(dx: number, dz: number, jump: boolean, attack: boolean, roll?: boolean, attackKey?: AttackKey, attackHoldDuration?: number, attackHeld?: boolean, interact?: boolean, block?: boolean, swimLift?: number, sprint?: boolean, fly?: boolean, flyLift?: number): void
    update(dt: number, entity: CharacterEntity): void
    reset(entity?: CharacterEntity): void
}
