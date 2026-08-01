import type {CharacterEntity} from '../../../character/types.ts'
import type {AIContext, AIState, AIStateHandler} from './types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import {patrolHandler} from './states/patrol.ts'
import {chaseHandler} from './states/chase.ts'
import {attackHandler} from './states/attack.ts'
import {approachHandler} from './states/approach.ts'
import {volleyHandler} from './states/volley.ts'
import {kiteHandler} from './states/kite.ts'

const AI_HANDLERS: Record<AIState, AIStateHandler> = {
    patrol: patrolHandler,
    chase: chaseHandler,
    attack: attackHandler,
    approach: approachHandler,
    volley: volleyHandler,
    kite: kiteHandler,
}

export const createAIMachine = (
    character: CharacterEntity,
    spawnX: number, spawnY: number, spawnZ: number,
    detectionRange: number,
    losChecker: LineOfSightChecker | null = null,
): AIContext => ({
    characterId: character.id,
    spawnPoint: {x: spawnX, y: spawnY, z: spawnZ},
    patrolRadius: detectionRange * 0.6,
    waypoint: {x: spawnX, y: spawnY, z: spawnZ},
    currentState: 'patrol',
    stateTime: 0,
    waitTimer: 0,
    targetId: undefined,
    strafeDir: 0,
    strafeTimer: 0,
    losChecker,
})

export const updateAI = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
    setInput: (dx: number, dz: number, attack: boolean) => void,
): void => {
    if (character.combat.isDead) return

    const handler = AI_HANDLERS[ctx.currentState]

    for (const t of handler.transitions) {
        if (t.guard(ctx, character, allCharacters)) {
            handler.exit(ctx, character)
            ctx.currentState = t.to
            ctx.stateTime = 0
            AI_HANDLERS[ctx.currentState].enter(ctx, character)
            return
        }
    }

    ctx.stateTime += dt
    handler.update(dt, ctx, character, allCharacters, setInput)
}
