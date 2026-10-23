import type {BodyFormStateDefinition} from '../../common/state.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {DEFAULT_POISE_MAX} from '../../../../../character/combat/constants.ts'
import {creatureStateMeta} from '../../common/creature_runtime/state_timing.ts'

/** 狼状态基线：四足尺寸 / 基础生命 / 动画步态时长（最终数值由 `resolveBodyFormState` 计算） */
export const WOLF_STATE: BodyFormStateDefinition = {
    size: {width: 0.5, height: 0.9, depth: 1.3},
    centerOffsetY: 0.45,
    eyeHeight: 0.55,
    baseHealth: 12,
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
    baseMoveSpeedMultiplier: 1,
    basePoise: DEFAULT_POISE_MAX,
    animation: creatureStateMeta({idle: 1.8, walking: 0.7, jumping: 0.35, falling: 0.45, swimming: 0.9, floating: 1.6}),
}
