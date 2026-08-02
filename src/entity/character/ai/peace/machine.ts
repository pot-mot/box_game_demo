import type {CharacterEntity} from '../../../../character/types.ts'
import type {PeaceConfig} from '../../../../character/ai_strategy/peace.ts'
import type {AIContext} from '../types.ts'
import {isBuildConfig} from '../../../../character/ai_strategy/types.ts'
import type {PeaceState, PeaceStateHandler} from './types.ts'
import {patrolHandler} from './states/patrol.ts'
import {buildHandler} from './states/build.ts'

const PEACE_HANDLERS: Record<PeaceState, PeaceStateHandler> = {
    patrol: patrolHandler,
    build: buildHandler,
}

/** 创建和平 FSM 上下文字段 */
export const initPeaceContext = (
    ctx: AIContext,
    config: PeaceConfig,
): void => {
    ctx.peaceState = 'patrol'
    ctx.peaceStateTime = 0
    ctx.peaceConfig = config
    ctx.waypoint = {x: ctx.spawnPoint.x, y: ctx.spawnPoint.y, z: ctx.spawnPoint.z}
    ctx.waitTimer = 0
    ctx.buildTimer = isBuildConfig(config) ? config.buildInterval : 0
}

/** 运行和平 FSM 一帧 */
export const updatePeaceFSM = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    setInput: (dx: number, dz: number, attack: boolean) => void,
): void => {
    const handler = PEACE_HANDLERS[ctx.peaceState]

    for (const t of handler.transitions) {
        if (t.guard(ctx, character)) {
            handler.exit(ctx, character)
            ctx.peaceState = t.to
            ctx.peaceStateTime = 0
            PEACE_HANDLERS[ctx.peaceState].enter(ctx, character)
            break
        }
    }

    ctx.peaceStateTime += dt
    handler.update(dt, ctx, character, setInput)
}
