import type {CharacterEntity} from '../../../../character/types.ts'
import type {AIContext, AISetInput} from '../types.ts'
import {AIM_ALIGN_HALF_ANGLE} from '../constants.ts'

/**
 * 目标方位与角色朝向的夹角（rad，0 = 正对目标）。
 * `getFacingAngle` 未注入（单元测试等）或与目标重合时返回 0，视为已对准。
 */
export const facingAngleTo = (
    ctx: AIContext,
    character: CharacterEntity,
    target: CharacterEntity,
): number => {
    const facing = ctx.getFacingAngle?.()
    if (facing === undefined) return 0
    const pos = character.body.translation()
    const tp = target.body.translation()
    const dx = tp.x - pos.x
    const dz = tp.z - pos.z
    if (Math.hypot(dx, dz) < 0.001) return 0
    let diff = Math.atan2(dx, dz) - facing
    diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI
    return Math.abs(diff)
}

/**
 * 是否已瞄准目标（远程出招前的转向/瞄准门控）：
 * 超出 `AIM_ALIGN_HALF_ANGLE` 说明尚未转身到位，应先转向再开火，避免弹道背身飞离。
 */
export const isAimingAtTarget = (
    ctx: AIContext,
    character: CharacterEntity,
    target: CharacterEntity,
): boolean => facingAngleTo(ctx, character, target) <= AIM_ALIGN_HALF_ANGLE

/** 回身射击流程结果：`aiming` = 正在站定转身，`firing` = 已对准并开火 */
export const AIM_FIRE_RESULTS = ['aiming', 'firing'] as const
export type AimFireResult = typeof AIM_FIRE_RESULTS[number]

/**
 * 远程「回身射击」完整流程（寻找目标由调用方完成）：**站定 → 转向目标 → 攻击**。
 * - 进入即置 `ctx.combatAimActive = true`，由 `world.ts` 把朝向锁到目标（移动阶段不锁，逃跑时面朝移动方向）；
 * - 未对准：站定（移动输入 0）并继续转身，返回 `aiming`；
 * - 已对准：原地开火（移动输入 0 + attack），返回 `firing`。
 * 调用方需先确认武器在射程内且起手就绪（冷却）；调用后应停止再输出移动输入（否则会边跑边瞄）。
 */
export const aimAndFireAt = (
    ctx: AIContext,
    character: CharacterEntity,
    target: CharacterEntity,
    setInput: AISetInput,
): AimFireResult => {
    ctx.combatAimActive = true
    const pos = character.body.translation()
    const tp = target.body.translation()
    const dx = tp.x - pos.x
    const dz = tp.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.001 || !isAimingAtTarget(ctx, character, target)) {
        setInput(0, 0, false)
        return 'aiming'
    }
    setInput(0, 0, true, dx / dist, dz / dist)
    return 'firing'
}
