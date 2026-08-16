import type {CharacterEntity} from '../../../character/types.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import type {AIContext, AISetInput, AttackDetectChecker} from './types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from './constants.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {initCombatContext, updateCombatFSM} from './combat/machine.ts'
import {initPeaceContext, updatePeaceFSM} from './peace/machine.ts'
import {fleeHandler} from './combat/states/flee.ts'
import {createNavRunContext} from './nav/machine.ts'

/* 扇形扫描射线命中距离复用缓冲（由 castFan 写入，避免每帧分配） */
const _fanDists = new Float32Array(VISION_FAN_RAY_COUNT)

/** 检测最近敌人，返回角色 ID 和距离。
 * 三重门控：侦测半径 → 身前 270° 扇形（朝向两侧各 135°，正后方为盲区）
 * → 扇形扫描射线遮挡（每 10° 一条射线覆盖整个扇形，命中点早于目标体表则被遮挡） */
const findNearestEnemy = (
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
): {id: number; dist: number} | undefined => {
    const pos = character.body.translation()
    const skill = character.combat.skills[character.combat.currentSkillIndex]
    const detRange = skill?.config.weapon.detectionRange ?? 8
    const los = ctx.losChecker
    const facing = ctx.getFacingAngle?.() ?? 0
    /* 扫描射线起点取眼部高度（与 debug 可视化同源） */
    const eyeY = pos.y + CHARACTER_BASE_SIZE.height * character.config.scale * 0.4

    let bestDist = Infinity
    let bestId: number | undefined
    let fanCast = false

    for (const other of allCharacters) {
        if (other.id === character.id || other.combat.isDead) continue
        if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue

        const op = other.body.translation()
        const dx = op.x - pos.x
        const dz = op.z - pos.z
        const d = Math.hypot(dx, dz)
        if (d >= detRange || d >= bestDist) continue

        /* 扇形角度门控：目标方位角与朝向的归一化角差超出半角（身后盲区）则不可见 */
        let diff = 0
        if (d > 0.001) {
            diff = Math.atan2(dx, dz) - facing
            diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI
            if (Math.abs(diff) > VISION_FAN_HALF_ANGLE) continue
        }

        /* 扇形射线遮挡：取最接近目标方位角的扫描射线（懒发射：有候选才扫描一次）。
         * 射线会命中目标自身体表（约 d - 胶囊半径），命中点比体表更近才判遮挡 */
        if (los && d > 0.001) {
            if (!fanCast) {
                los.castFan(pos.x, eyeY, pos.z, facing, detRange, _fanDists)
                fanCast = true
            }
            const idx = Math.round((diff + VISION_FAN_HALF_ANGLE) / VISION_FAN_RAY_STEP)
            const clamped = Math.max(0, Math.min(VISION_FAN_RAY_COUNT - 1, idx))
            const bodyRadius = CHARACTER_BASE_SIZE.width * other.config.scale / 2
            if (_fanDists[clamped] < d - bodyRadius - 0.05) continue
        }

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
    attackDetectChecker?: AttackDetectChecker,
    getFacingAngle?: () => number,
): AIContext => {
    const ctx: AIContext = {
        characterId: character.id,
        spawnPoint: {x: spawnX, y: spawnY, z: spawnZ},
        losChecker,
        attackDetectChecker,
        getFacingAngle,
        nav: createNavRunContext(character.navEnabled),
        navSensor: null,
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
    setInput: AISetInput,
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
