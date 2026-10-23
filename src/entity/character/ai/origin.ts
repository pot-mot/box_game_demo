import type {CharacterEntity} from '../../../character/types.ts'
import type {AIContext} from './types.ts'
import {formCenterOffsetY} from '../body_form/common/geometry.ts'

/** 由角色物理体反算脚底原点 Y（body 中心 - 体形中心偏移）写入 `ctx.origin` */
export const setOriginFromCharacter = (ctx: AIContext, character: CharacterEntity): void => {
    const pos = character.body.translation()
    const footY = pos.y - formCenterOffsetY(character.config)
    ctx.origin.x = pos.x
    ctx.origin.y = footY
    ctx.origin.z = pos.z
}

/** 写入任意世界坐标（狩猎者用被击杀者脚底位置） */
export const setOriginFromPosition = (ctx: AIContext, x: number, y: number, z: number): void => {
    ctx.origin.x = x
    ctx.origin.y = y
    ctx.origin.z = z
}

/**
 * 漫游者原点更新：计时器在和平与战斗期都持续倒数，但原点写入只在脱战后发生。
 * 战斗期冻结（只计时、不写原点）；若战斗期间已到期，则脱战后首个和平帧立即以当前位置更新。
 * 非 roamer 策略不消耗计时器。
 */
export const updateOrigin = (dt: number, ctx: AIContext, character: CharacterEntity): void => {
    if (ctx.originStrategy !== 'roamer') return
    ctx.originTimer -= dt
    if (ctx.originTimer > 0) return
    if (ctx.activeFsm !== 'peace') return
    setOriginFromCharacter(ctx, character)
    /* originInterval <= 0 时回退策略默认间隔，避免每帧写入 */
    ctx.originTimer = character.originInterval > 0 ? character.originInterval : ctx.originConfig.interval
}

/**
 * 击杀钩子：每次成功击杀时按原点策略迁移原点。
 * - fighter：取击杀者自身脚底位置
 * - hunter：取被击杀者脚底位置
 * - resident / roamer：不响应击杀
 */
export const notifyAIKill = (
    ctx: AIContext,
    character: CharacterEntity,
    victim: {x: number; y: number; z: number},
): void => {
    if (ctx.originStrategy === 'fighter') {
        setOriginFromCharacter(ctx, character)
    } else if (ctx.originStrategy === 'hunter') {
        setOriginFromPosition(ctx, victim.x, victim.y, victim.z)
    }
}
