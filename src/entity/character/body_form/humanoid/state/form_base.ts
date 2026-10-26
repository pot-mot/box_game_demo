import type {BodyFormBase} from '../../common/base.ts'
import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {WeaponConfig} from '../../../../../character/weapon/catalog.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {DEFAULT_POISE_MAX} from '../../../../../character/combat/constants.ts'
import {BLOCKING_POSE_PERIOD, GUARD_BROKEN_POSE_DURATION} from '../../../appearance/constants.ts'
import {FLINCH_DURATION} from '../../../../../character/combat/attack_phases.ts'
import {DEFAULT_GET_UP_DURATION, DEFAULT_KNOCKDOWN_DURATION} from '../../../../../character/combat/constants.ts'
import {ROLL_DURATION} from '../../../../../character/combat/roll_skill.ts'
import {INTERACTION_DURATION} from '../../../../../character/interaction/types.ts'
import {WALK_CYCLE_FREQ, SWIM_CYCLE_FREQ, JUMP_EXTEND_END, FALL_END} from './constants.ts'

/** 人形基础尺寸（scale=1）：人形是几何真源，其余体形各自声明自己的尺寸 */
export const HUMANOID_SIZE = {width: 0.25, height: 1, depth: 0.1625} as const
/** 人形眼高（脚底起算，scale=1） */
export const HUMANOID_EYE_HEIGHT = 0.4

const baseHealthOf = (weapon: WeaponConfig): number => weapon.type === 'melee' ? 15 : 8

/** 人形基础状态时长（状态系统 / 动画系统共用） */
export const HUMANOID_CLIP_STATE_META: Readonly<Record<BaseClipState, {duration: number; loop: boolean}>> = {
    idle: {duration: (Math.PI * 2) / 1.8, loop: true},
    walking: {duration: (Math.PI * 2) / WALK_CYCLE_FREQ, loop: true},
    sprinting: {duration: (Math.PI * 2) / (WALK_CYCLE_FREQ * 1.4), loop: true},
    jumping: {duration: JUMP_EXTEND_END, loop: false},
    falling: {duration: 1, loop: true},
    flying: {duration: (Math.PI * 2) / 1.4, loop: true},
    swimming: {duration: (Math.PI * 2) / SWIM_CYCLE_FREQ, loop: true},
    floating: {duration: (Math.PI * 2) / 1.6, loop: true},
    dying: {duration: FALL_END, loop: false},
    rolling: {duration: ROLL_DURATION, loop: false},
    flinching: {duration: FLINCH_DURATION, loop: false},
    interacting: {duration: INTERACTION_DURATION, loop: false},
    knockdown: {duration: DEFAULT_KNOCKDOWN_DURATION, loop: false},
    getting_up: {duration: DEFAULT_GET_UP_DURATION, loop: false},
    blocking: {duration: BLOCKING_POSE_PERIOD, loop: true},
    guard_broken: {duration: GUARD_BROKEN_POSE_DURATION, loop: false},
}

/** 人形基础定义：基础属性、尺寸、动画时长；最终数值由 `resolveBodyFormBase` 计算 */
export const HUMANOID_BASE: BodyFormBase = {
    size: HUMANOID_SIZE,
    centerOffsetY: HUMANOID_SIZE.height / 2,
    eyeHeight: HUMANOID_EYE_HEIGHT,
    baseHealth: baseHealthOf,
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
    baseMoveSpeedMultiplier: 1,
    basePoise: DEFAULT_POISE_MAX,
    animation: HUMANOID_CLIP_STATE_META,
}
