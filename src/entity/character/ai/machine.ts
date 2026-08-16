import type {CharacterEntity} from '../../../character/types.ts'
import type {CombatSubStrategy} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import type {AIContext, AISetInput, AttackDetectChecker} from './types.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP, STALL_INPUT_EPS, STALL_CHECK_TRAVEL, STALL_TIMEOUT, COMBAT_REENTRY_COOLDOWN, CHASE_LEASH_RADIUS} from './constants.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {initCombatContext, updateCombatFSM} from './combat/machine.ts'
import {initPeaceContext, updatePeaceFSM} from './peace/machine.ts'
import {fleeHandler} from './combat/states/flee.ts'
import {rerollWaypoint} from './peace/states/patrol.ts'
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

        /* 静止检测（卡死自愈）字段 */
        stallTimer: 0,
        stallAnchorX: spawnX,
        stallAnchorZ: spawnZ,
        combatReentryTimer: 0,

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
    rerollWaypoint(ctx)

    return ctx
}

/** 卡死恢复：按当前活跃 FSM 分发自救动作 */
const recoverFromStall = (ctx: AIContext): void => {
    if (ctx.activeFsm === 'peace') {
        /* 巡逻/建造：重掷路点（新路点大概率换方向，卡缝/贴人状态自然解除） */
        rerollWaypoint(ctx)
        ctx.waitTimer = 0
        return
    }
    if (ctx.combatState === 'flee') {
        /* 逃跑卡死：仅重掷逃跑方向（旋转 ±60°〜120° 换被堵轴），不轻易放弃战斗 */
        const sign = Math.random() < 0.5 ? -1 : 1
        const angle = sign * (Math.PI / 3 + Math.random() * Math.PI / 3)
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const fx = ctx.combatFleeDir.x * cosA - ctx.combatFleeDir.z * sinA
        const fz = ctx.combatFleeDir.x * sinA + ctx.combatFleeDir.z * cosA
        const fl = Math.hypot(fx, fz)
        if (fl > STALL_INPUT_EPS) {
            ctx.combatFleeDir.x = fx / fl
            ctx.combatFleeDir.z = fz / fl
        }
        return
    }
    /* 其他战斗状态卡死：强制放弃并进入重新接敌冷却（避免超时→立刻回追的空转） */
    ctx.activeFsm = 'peace'
    ctx.peaceState = 'patrol'
    ctx.peaceStateTime = 0
    ctx.combatState = 'inactive'
    ctx.waitTimer = 0
    rerollWaypoint(ctx)
    ctx.combatReentryTimer = COMBAT_REENTRY_COOLDOWN
}

/** 静止检测记账：有移动意图但长时间无水平位移则触发恢复；
 * 攻击中（有攻击意图或攻击动作进行中）视为有效战斗行为，不计入卡死 */
const updateStallDetection = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    intentDX: number,
    intentDZ: number,
    attacking: boolean,
): void => {
    const pos = character.body.translation()
    if (attacking) {
        /* 正在交火：面对面对峙位移为零属正常，重置检测基准 */
        ctx.stallTimer = 0
        ctx.stallAnchorX = pos.x
        ctx.stallAnchorZ = pos.z
        return
    }
    if (Math.hypot(intentDX, intentDZ) < STALL_INPUT_EPS) {
        /* 无移动意图（路点等待/射程内站桩等）：重置检测基准 */
        ctx.stallTimer = 0
        ctx.stallAnchorX = pos.x
        ctx.stallAnchorZ = pos.z
        return
    }
    const travel = Math.hypot(pos.x - ctx.stallAnchorX, pos.z - ctx.stallAnchorZ)
    if (travel > STALL_CHECK_TRAVEL) {
        /* 确认在动：推进锚点并清零 */
        ctx.stallTimer = 0
        ctx.stallAnchorX = pos.x
        ctx.stallAnchorZ = pos.z
        return
    }
    ctx.stallTimer += dt
    if (ctx.stallTimer < STALL_TIMEOUT) return
    ctx.stallTimer = 0
    ctx.stallAnchorX = pos.x
    ctx.stallAnchorZ = pos.z
    recoverFromStall(ctx)
}

/** 受击转战斗（仇恨）：被击中时清除接敌冷却并强制锁定攻击者，
 * 解决和平态被背后/视野外攻击不还手、冷却期内挨打不反应的问题 */
export const notifyAIDamaged = (
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
    sourceId: number,
): void => {
    if (character.combat.isDead) return
    ctx.combatReentryTimer = 0
    const source = allCharacters.find(c => c.id === sourceId)
    if (!source || source.combat.isDead) return
    /* 友军误伤不强制开战 */
    if (!character.combat.attackTendency(character.combat.faction, source.combat.faction)) return
    ctx.activeFsm = 'combat'
    ctx.combatState = 'chase'
    ctx.combatStateTime = 0
    ctx.combatTargetId = sourceId
}

export const updateAI = (
    dt: number,
    ctx: AIContext,
    character: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
    setInput: AISetInput,
): void => {
    if (character.combat.isDead) return

    /* 卡死放弃战斗后的重新接敌冷却递减 */
    ctx.combatReentryTimer = Math.max(0, ctx.combatReentryTimer - dt)

    /* ── 统一敌情检测 ── */
    const enemy = findNearestEnemy(ctx, character, allCharacters)

    if (enemy) {
        /* 有敌人 → 切到战斗 FSM（重新接敌冷却期内不进入，配合卡死放弃形成强制游走窗口） */
        if (ctx.activeFsm !== 'combat' && ctx.combatReentryTimer <= 0) {
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

    /* 包装 setInput 记录本帧意图方向与攻击意图（过滤前），供静止检测使用 */
    let intentDX = 0
    let intentDZ = 0
    let intentAttack = false
    const trackedSetInput: AISetInput = (dx, dz, attack, attackDX, attackDZ) => {
        intentDX = dx
        intentDZ = dz
        if (attack) intentAttack = true
        setInput(dx, dz, attack, attackDX, attackDZ)
    }

    if (ctx.activeFsm === 'combat') {
        /* 追击活动半径：被同速目标拖离出生点过远时放弃，防止平行追到无限远 */
        if (ctx.combatState === 'chase') {
            const pos = character.body.translation()
            const leash = Math.hypot(pos.x - ctx.spawnPoint.x, pos.z - ctx.spawnPoint.z)
            if (leash > CHASE_LEASH_RADIUS) {
                ctx.activeFsm = 'peace'
                ctx.peaceState = 'patrol'
                ctx.peaceStateTime = 0
                ctx.combatState = 'inactive'
                ctx.waitTimer = 0
                rerollWaypoint(ctx)
                ctx.combatReentryTimer = COMBAT_REENTRY_COOLDOWN
            }
        }
        /* cowardly 首次发现有敌人直接进入 flee */
        if (enemy && ctx.combatStrategy === 'cowardly' && ctx.combatState === 'chase' && ctx.combatStateTime === 0) {
            if (ctx.combatBurstAttackCount < ctx.combatConfig.attackBurstCount) {
                ctx.combatState = 'flee'
                ctx.combatStateTime = 0
                fleeHandler.enter(ctx, character)
            }
        }
        updateCombatFSM(dt, ctx, character, allCharacters, trackedSetInput)
        /* combat FSM 可能把状态切到 inactive */
        if (ctx.combatState === 'inactive') {
            ctx.activeFsm = 'peace'
            ctx.peaceState = 'patrol'
            ctx.peaceStateTime = 0
            /* 敌人仍存活可见时施加接敌冷却：防止超时→peace→下帧立即回 chase 的
             * 空转循环（同速目标永追不上时会演变为平行走到无限远） */
            const enemyChar = enemy ? allCharacters.find(c => c.id === enemy.id) : undefined
            if (enemyChar && !enemyChar.combat.isDead) {
                ctx.combatReentryTimer = Math.max(ctx.combatReentryTimer, COMBAT_REENTRY_COOLDOWN)
            }
        }
    } else {
        updatePeaceFSM(dt, ctx, character, trackedSetInput)
    }

    /* 静止自检：决策层对被截断输入的兜底（接触阻断/nav stuck 清零后由这里触发自救）；
     * 攻击意图或攻击动作进行中视为有效战斗，不计入卡死 */
    updateStallDetection(dt, ctx, character, intentDX, intentDZ, intentAttack || character.combat.attackActive)
}
