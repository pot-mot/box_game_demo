import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import {FLINCH_DURATION} from '../../../../../character/combat/attack_phases.ts'
import {ROLL_DURATION} from '../../../../../character/combat/roll_skill.ts'
import {DEFAULT_GET_UP_DURATION, DEFAULT_KNOCKDOWN_DURATION, DYING_DURATION} from '../../../../../character/combat/constants.ts'
import {INTERACTION_DURATION} from '../../../../../character/interaction/types.ts'
import {BLOCKING_POSE_PERIOD, GUARD_BROKEN_POSE_DURATION} from '../../../appearance/constants.ts'

/** 生物体形自带视觉时长的状态（其余状态与玩法时长一致） */
export interface CreatureVisualTiming {
    readonly idle: number
    readonly walking: number
    readonly jumping: number
    readonly falling: number
    readonly swimming: number
    readonly floating: number
}

/** 生物基础状态时长：视觉状态由体形声明，玩法状态统一取玩法常量 */
export const creatureStateMeta = (visual: CreatureVisualTiming): Readonly<Record<BaseClipState, {duration: number; loop: boolean}>> => ({
    idle: {duration: visual.idle, loop: true},
    walking: {duration: visual.walking, loop: true},
    jumping: {duration: visual.jumping, loop: false},
    falling: {duration: visual.falling, loop: true},
    swimming: {duration: visual.swimming, loop: true},
    floating: {duration: visual.floating, loop: true},
    dying: {duration: DYING_DURATION, loop: false},
    rolling: {duration: ROLL_DURATION, loop: false},
    flinching: {duration: FLINCH_DURATION, loop: false},
    interacting: {duration: INTERACTION_DURATION, loop: false},
    knockdown: {duration: DEFAULT_KNOCKDOWN_DURATION, loop: false},
    getting_up: {duration: DEFAULT_GET_UP_DURATION, loop: false},
    blocking: {duration: BLOCKING_POSE_PERIOD, loop: true},
    guard_broken: {duration: GUARD_BROKEN_POSE_DURATION, loop: false},
})
