import type {BurningRuntime} from '../../types'
import {clampHealth} from '../../base/types/health'

/** 推进燃烧一步：生命值随时间递减，燃烧进度 = 1 - 生命 / 上限 */
export const stepBurning = (rt: BurningRuntime, dt: number): void => {
    clampHealth(rt, rt.health - dt)
    rt.burnProgress = 1 - rt.health / rt.maxHealth
}

/** 燃烧过程中质量随进度递减（对齐 cannon-es master：mass = config.mass × (1 - burn × 0.8)） */
export const burningMassScale = (burnProgress: number): number => 1.0 - burnProgress * 0.8
