import type {CharacterEntity} from '../../../../character/types.ts'
import type {AIContext} from '../types.ts'
import {MELEE_FALLBACK_DETECT_RANGE} from '../../combat/constants.ts'

/**
 * 目标是否处于近战攻击检测箱内。
 * 有 checker 时用武器检测箱（含朝向）；缺失时回退圆形距离常量。
 * 供 chase / attack 共用，保证「进入攻击距离即停止移动」与出招判定同源。
 */
export const inMeleeAttackRegion = (
    ctx: AIContext,
    character: CharacterEntity,
    target: CharacterEntity,
): boolean => {
    if (ctx.attackDetectChecker !== undefined) return ctx.attackDetectChecker(character, target)
    const pos = character.body.translation()
    const tp = target.body.translation()
    return Math.hypot(tp.x - pos.x, tp.z - pos.z) < MELEE_FALLBACK_DETECT_RANGE
}
