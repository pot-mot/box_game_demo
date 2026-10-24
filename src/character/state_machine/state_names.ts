/** 状态机状态名（仅名称，不包含任何运行时数据；数据统一存于 `CharacterState`） */
export const CHARACTER_STATES = ['idle', 'walking', 'jumping', 'falling', 'swimming', 'floating', 'attacking', 'air_attacking', 'dying', 'rolling', 'flinching', 'interacting', 'knockdown', 'getting_up', 'blocking', 'guard_broken'] as const
export type CharacterStateName = typeof CHARACTER_STATES[number]

/** 攻击态（由攻击 clip / 段驱动，不属于基础状态采样器） */
export const ATTACK_STATES = ['attacking', 'air_attacking'] as const
export type AttackState = typeof ATTACK_STATES[number]

const ATTACK_STATE_SET: ReadonlySet<CharacterStateName> = new Set(ATTACK_STATES)

export const isAttackState = (state: CharacterStateName): state is AttackState =>
    ATTACK_STATE_SET.has(state)

/** 由基础姿态采样器驱动的状态 */
export type BaseClipState = Exclude<CharacterStateName, AttackState>

export const BASE_CLIP_STATES: readonly BaseClipState[] =
    CHARACTER_STATES.filter((state): state is BaseClipState => !isAttackState(state))
