import type {CharacterEntity} from '../../../character/types.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import type {AIContext} from './types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import {initCombatContext, updateCombatFSM} from './combat/machine.ts'
import {initPeaceContext, updatePeaceFSM} from './peace/machine.ts'
import {fleeHandler} from './combat/states/flee.ts'

/** 检测最近敌人，返回角色 ID 和距离 */
const findNearestEnemy = (
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
): {id: number; dist: number} | undefined => {
    const pos = character.body.position
    const skill = character.combat.skills[character.combat.currentSkillIndex]
    const detRange = skill?.config.weapon.detectionRange ?? 8
    const los = ctx.losChecker

    let bestDist = Infinity
    let bestId: number | undefined

    for (const other of allCharacters) {
        if (other.id === character.id || other.combat.isDead) continue
        if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue

        const op = other.body.position
        const d = Math.hypot(op.x - pos.x, op.z - pos.z)
        if (d >= detRange || d >= bestDist) continue

        if (los && !los.hasLOS(pos.x, pos.y + 0.5, pos.z, op.x, op.y + 0.5, op.z)) continue

        bestDist = d
        bestId = other.id
    }

    return bestId !== undefined ? {id: bestId, dist: bestDist} : undefined
}

export const createAIMachine = (
    character: CharacterEntity,
    spawnX: number, spawnY: number, spawnZ: number,
    detectionRange: number,
    losChecker: LineOfSightChecker | null = null,
    peaceConfig: PeaceConfig = DEFAULT_PEACE_CONFIGS.patrol,
    combatStrategy: CombatSubStrategy = 'tactical',
): AIContext => {
    const ctx: AIContext = {
        characterId: character.id,
        spawnPoint: {x: spawnX, y: spawnY, z: spawnZ},
        losChecker,
        activeFsm: 'peace',

        /* 战斗 FSM 字段 */
        combatState: 'inactive',
        combatStateTime: 0,
        combatTargetId: undefined,
        combatStrafeDir: 0,
        combatStrafeTimer: 0,
        combatFleeDir: {x: 0, z: 0},
        combatBurstAttackCount: 0,
        combatStrategy,
        combatConfig: DEFAULT_COMBAT_CONFIGS[combatStrategy],

        /* 和平 FSM 字段 */
        peaceState: 'patrol',
        peaceStateTime: 0,
        peaceConfig,
        waypoint: {x: spawnX, y: spawnY, z: spawnZ},
        waitTimer: 0,
        buildTimer: 0,
    }

    initCombatContext(ctx, combatStrategy, DEFAULT_COMBAT_CONFIGS[combatStrategy])
    initPeaceContext(ctx, peaceConfig)
    ctx.waypoint.x = spawnX + (Math.random() - 0.5) * detectionRange * 1.2
    ctx.waypoint.z = spawnZ + (Math.random() - 0.5) * detectionRange * 1.2

    return ctx
}

export const updateAI = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
    setInput: (dx: number, dz: number, attack: boolean) => void,
): void => {
    if (character.combat.isDead) return

    /* ── 统一敌情检测 ── */
    const enemy = findNearestEnemy(ctx, character, allCharacters)

    if (enemy) {
        /* 有敌人 → 切到战斗 FSM */
        if (ctx.activeFsm !== 'combat') {
            ctx.activeFsm = 'combat'
            ctx.combatState = 'chase'
            ctx.combatStateTime = 0
            ctx.combatTargetId = enemy.id
        }
    } else if (ctx.activeFsm === 'combat') {
        /* 无敌人且战斗态 → 检查是否可退出 */
        if (ctx.combatState === 'inactive') {
            ctx.activeFsm = 'peace'
            ctx.peaceState = 'patrol'
            ctx.peaceStateTime = 0
        }
    }

    if (ctx.activeFsm === 'combat') {
        /* cowardly 首次发现有敌人直接进入 flee */
        if (enemy && ctx.combatStrategy === 'cowardly' && ctx.combatState === 'chase' && ctx.combatStateTime === 0) {
            if (ctx.combatBurstAttackCount < ctx.combatConfig.attackBurstCount) {
                ctx.combatState = 'flee'
                ctx.combatStateTime = 0
                fleeHandler.enter(ctx, character)
            }
        }
        updateCombatFSM(dt, ctx, character, allCharacters, setInput)
        /* combat FSM 可能把状态切到 inactive */
        if (ctx.combatState === 'inactive') {
            ctx.activeFsm = 'peace'
            ctx.peaceState = 'patrol'
            ctx.peaceStateTime = 0
        }
    } else {
        updatePeaceFSM(dt, ctx, character, setInput)
    }
}
