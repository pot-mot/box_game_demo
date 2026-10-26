import type {BodyFormBase} from '../../common/base.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {DEFAULT_POISE_MAX} from '../../../../../character/combat/constants.ts'
import {creatureStateMeta} from '../../common/creature_runtime/state_timing.ts'

/** 狼基础定义：四足尺寸 / 基础生命 / 动画步态时长（最终数值由 `resolveBodyFormBase` 计算） */
export const WOLF_BASE: BodyFormBase = {
    size: {width: 0.5, height: 0.9, depth: 1.3},
    centerOffsetY: 0.45,
    eyeHeight: 0.55,
    baseHealth: 12,
    baseDefense: ZERO_PROFILE,
    baseAttack: ZERO_PROFILE,
    baseMoveSpeedMultiplier: 1,
    basePoise: DEFAULT_POISE_MAX,
    animation: creatureStateMeta({idle: 8.0, walking: 1.4, sprinting: 1.0, jumping: 0.35, falling: 1.5, swimming: 1.8, floating: 3.2, flying: 2.4}),
}
