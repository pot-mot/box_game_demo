import type {BodyFormBase} from '../../common/base.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {DEFAULT_POISE_MAX} from '../../../../../character/combat/constants.ts'
import {creatureStateMeta} from '../../common/creature_runtime/state_timing.ts'

/** 飞龙状态基线：双足双翼尺寸 / 基础生命 / 动画步态时长。 */
export const WYVERN_BASE: BodyFormBase = {
    size: {width: 1.0, height: 2.0, depth: 1.6},
    centerOffsetY: 1.0,
    eyeHeight: 1.5,
    baseHealth: 18,
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
    baseMoveSpeedMultiplier: 1,
    basePoise: DEFAULT_POISE_MAX,
    animation: creatureStateMeta({idle: 8.0, walking: 1.7, sprinting: 1.2, jumping: 0.4, falling: 1.5, swimming: 2.0, floating: 2.0, flying: 0.9}),
}
