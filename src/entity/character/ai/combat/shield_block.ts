import type {CharacterEntity} from '../../../../character/types.ts'
import type {AIContext} from '../types.ts'
import {AI_DEFEND_FACING_DOT, AI_DEFEND_RANGE} from '../constants.ts'

/**
 * 反应式最小格挡：自身持盾且格挡槽可用，战斗目标进入威胁范围内正在起手 / 开火且朝向我方时返回 true。
 * 无盾 / 已破防 / 目标已亡 / 超出范围 / 未面向我方 → false。
 *
 * 举盾是**限时反应**而非持续姿态：一旦触发即持续 `character.aiBlockDuration`（窗口内即使威胁消失也举满），
 * 窗口结束后进入 `character.aiBlockCooldown` 冷却。否则面对连续出手的敌人，`blocking`（状态机优先级高于
 * `attacking`）会让持盾 AI 一直举盾、永不出手（`combatBlockTimer` / `combatBlockCooldownTimer` 由
 * `updateAI` 逐帧递减）。
 */
export const shouldReactiveBlock = (
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
): boolean => {
    const block = character.state.combat.block
    if (block === undefined || character.state.combat.guard <= 0 || character.state.combat.isDead) return false
    /* 已在举盾窗口中：持续举满（不重复触发冷却） */
    if (ctx.combatBlockTimer > 0) return true
    /* 冷却中：不发起新举盾，让出出手窗口 */
    if (ctx.combatBlockCooldownTimer > 0) return false
    const targetId = ctx.combatTargetId
    if (targetId === undefined) return false
    const target = allCharacters.find(c => c.state.identity.id === targetId)
    if (target === undefined || target.state.combat.isDead) return false
    if (!target.state.combat.attackActive) return false
    const myPos = character.body.translation()
    const tp = target.body.translation()
    const dx = myPos.x - tp.x
    const dz = myPos.z - tp.z
    const dist = Math.hypot(dx, dz)
    if (dist > AI_DEFEND_RANGE || dist < 1e-4) return false
    const adx = target.state.combat.attackDirX
    const adz = target.state.combat.attackDirZ
    const adLen = Math.hypot(adx, adz)
    if (adLen < 1e-4) return false
    const dot = (adx * dx + adz * dz) / (adLen * dist)
    if (dot < AI_DEFEND_FACING_DOT) return false
    /* 威胁成立：按角色属性开启一次举盾窗口 */
    ctx.combatBlockTimer = character.state.ai.aiBlockDuration
    return true
}
