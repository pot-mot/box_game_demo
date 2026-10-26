import type {BodyFormBase} from '../../common/base.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {DEFAULT_POISE_MAX} from '../../../../../character/combat/constants.ts'
import {creatureStateMeta} from '../../common/creature_runtime/state_timing.ts'

/** 马状态基线：高腿长颈四足尺寸 / 基础生命 / 动画步态时长。 */
export const HORSE_BASE: BodyFormBase = {
    size: {width: 0.7, height: 1.9, depth: 1.9},
    centerOffsetY: 0.95,
    eyeHeight: 1.35,
    baseHealth: 16,
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
    baseMoveSpeedMultiplier: 1,
    basePoise: DEFAULT_POISE_MAX,
    animation: creatureStateMeta({idle: 8.0, walking: 1.6, sprinting: 1.1, jumping: 0.4, falling: 1.5, swimming: 2.0, floating: 3.6, flying: 2.4}),
}
