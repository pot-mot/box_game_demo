import type {CharacterEntity} from '../../../../character/types.ts'
import type {CombatSubStrategy, CombatConfig} from '../../../../character/ai_strategy/combat.ts'
import type {AIContext} from '../types.ts'
import type {CombatState, CombatStateHandler} from './types.ts'
import {chaseHandler} from './states/chase.ts'
import {attackHandler} from './states/attack.ts'
import {approachHandler} from './states/approach.ts'
import {volleyHandler} from './states/volley.ts'
import {kiteHandler} from './states/kite.ts'
import {fleeHandler} from './states/flee.ts'

const COMBAT_HANDLERS: Record<CombatState, CombatStateHandler> = {
    chase: chaseHandler,
    attack: attackHandler,
    approach: approachHandler,
    volley: volleyHandler,
    kite: kiteHandler,
    flee: fleeHandler,
    inactive: {
        enter: () => {},
        update: () => {},
        exit: () => {},
        transitions: [],
    },
}

/** 创建战斗 FSM 上下文字段 */
export const initCombatContext = (
    ctx: AIContext,
    strategy: CombatSubStrategy,
    config: CombatConfig,
): void => {
    ctx.combatState = 'inactive'
    ctx.combatStateTime = 0
    ctx.combatTargetId = undefined
    ctx.combatStrafeDir = 0
    ctx.combatStrafeTimer = 0
    ctx.combatFleeDir = {x: 0, z: 0}
    ctx.combatBurstAttackCount = 0
    ctx.combatStrategy = strategy
    ctx.combatConfig = config
}

/** 运行战斗 FSM 一帧 */
export const updateCombatFSM = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
    setInput: (dx: number, dz: number, attack: boolean) => void,
): void => {
    const handler = COMBAT_HANDLERS[ctx.combatState]

    for (const t of handler.transitions) {
        if (t.guard(ctx, character, allCharacters)) {
            handler.exit(ctx, character)
            ctx.combatState = t.to
            ctx.combatStateTime = 0
            COMBAT_HANDLERS[ctx.combatState].enter(ctx, character)
            if (ctx.combatState === 'inactive') return
            break
        }
    }

    ctx.combatStateTime += dt
    handler.update(dt, ctx, character, allCharacters, setInput)
}
