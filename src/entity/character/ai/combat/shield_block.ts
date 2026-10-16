import type {CharacterEntity} from '../../../../character/types.ts'
import type {AIContext} from '../types.ts'
import {AI_DEFEND_FACING_DOT, AI_DEFEND_RANGE} from '../constants.ts'

/**
 * 反应式最小格挡：自身持盾且格挡槽可用，战斗目标进入威胁范围内正在起手 / 开火且朝向我方时返回 true。
 * 无盾 / 已破防 / 目标已亡 / 超出范围 / 未面向我方 → false。
 */
export const shouldReactiveBlock = (
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
): boolean => {
    const block = character.combat.block
    if (block === undefined || character.combat.guard <= 0 || character.combat.isDead) return false
    const targetId = ctx.combatTargetId
    if (targetId === undefined) return false
    const target = allCharacters.find(c => c.id === targetId)
    if (target === undefined || target.combat.isDead) return false
    if (!target.combat.attackActive) return false
    const myPos = character.body.translation()
    const tp = target.body.translation()
    const dx = myPos.x - tp.x
    const dz = myPos.z - tp.z
    const dist = Math.hypot(dx, dz)
    if (dist > AI_DEFEND_RANGE || dist < 1e-4) return false
    const adx = target.combat.attackDirX
    const adz = target.combat.attackDirZ
    const adLen = Math.hypot(adx, adz)
    if (adLen < 1e-4) return false
    const dot = (adx * dx + adz * dz) / (adLen * dist)
    return dot >= AI_DEFEND_FACING_DOT
}
