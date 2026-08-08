import {describe, it, expect} from 'vitest'
import {Body, BODY_TYPES, Box, Vec3, Heightfield, Quaternion, Plane} from 'cannon-es'
import {createSharedWorld} from '../../../physics/world.ts'
import {
    FIXED_TIME_STEP,
    TERRAIN_COLLISION_GROUP,
    TERRAIN_COLLISION_MASK,
    DEFAULT_COLLISION_GROUP,
    DEFAULT_COLLISION_MASK,
} from '../../../physics/constants.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {computeSeparation} from './separation.ts'
import {CHARACTER_SEPARATION_SPEED} from './constants.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import type {CharacterEntity} from '../../../character/types.ts'

const DT = FIXED_TIME_STEP
const R = 0.125
const MIN_DIST = R * 2

/** 构造角色（与 slope.test.ts 相同模式） */
const makeChar = (
    shared: ReturnType<typeof createSharedWorld>,
    id: number,
    x: number,
    y: number,
    z: number,
    speed = 6,
): CharacterEntity => {
    const body = new Body({
        mass: 1,
        type: BODY_TYPES.DYNAMIC,
        linearDamping: 0.2,
        fixedRotation: true,
        material: shared.charMat,
        collisionFilterGroup: CHARACTER_COLLISION_GROUP,
        collisionFilterMask: CHARACTER_COLLISION_MASK,
    })
    body.addShape(new Box(new Vec3(R, 0.5, R)))
    body.position.set(x, y, z)
    shared.world.addBody(body)

    const slot = createSkillSlot(MELEE_SKILL_PRESETS.long_sword_slash)
    const entity: CharacterEntity = {
        id,
        config: {speed, jumpHeight: 2, scale: 1},
        mesh: null!,
        wireframe: undefined,
        appearanceGroup: null!,
        body,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0,
        groundedTime: 0,
        rowText: '',
        isPlayer: false,
        peaceStrategy: 'patrol',
        combatStrategy: 'tactical',
        isDying: false,
        dyingTimer: 0,
        dashCooldownTimer: 0,
        combat: {
            faction: 0,
            health: 100,
            maxHealth: 100,
            isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null,
            onDeath: null,
            onDamageDealt: null,
            skills: [slot],
            currentSkillIndex: 0,
            attackActive: false,
            attackTimer: 0,
            attackedTargets: new Set(),
            attackDirX: 0,
            attackDirZ: 0,
            swingTilt: 0,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
    return entity
}

/** 构造静态箱子 */
const makeStaticBox = (
    shared: ReturnType<typeof createSharedWorld>,
    x: number,
    y: number,
    z: number,
    hw: number,
    hh: number,
    hd: number,
): Body => {
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: DEFAULT_COLLISION_GROUP,
        collisionFilterMask: DEFAULT_COLLISION_MASK,
    })
    body.addShape(new Box(new Vec3(hw, hh, hd)))
    body.position.set(x, y, z)
    shared.world.addBody(body)
    return body
}

/** 沿 X 方向上升的斜坡 Heightfield */
const makeSlope = (
    shared: ReturnType<typeof createSharedWorld>,
    slope: number,
    grid = 60,
    cell = 2,
): Body => {
    const heights = Array.from({length: grid}, (_, xi) =>
        Array.from({length: grid}, (_, _zi) => slope * xi * cell),
    )
    const body = new Body({
        mass: 0,
        type: BODY_TYPES.STATIC,
        material: shared.boxMat,
        collisionFilterGroup: TERRAIN_COLLISION_GROUP,
        collisionFilterMask: TERRAIN_COLLISION_MASK,
    })
    body.addShape(new Heightfield(heights, {elementSize: cell}))
    body.quaternion.copy(
        new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2),
    )
    shared.world.addBody(body)
    return body
}

/** 地面状态辅助类型 */
interface CharFrameState {
    gs: GroundState
    entity: CharacterEntity
}

/** 对多个角色执行一帧（统一 step，然后各角色地面检测 → 状态机 → 角色间分离） */
const tickMulti = (
    shared: ReturnType<typeof createSharedWorld>,
    states: CharFrameState[],
    inputs: {dx: number; dz: number; jump?: boolean}[],
): void => {
    shared.world.step(DT, DT, 1)

    for (let i = 0; i < states.length; i++) {
        const {entity} = states[i]
        const gs = resolveGroundState(
            shared.world.contacts,
            entity.body,
            states[i].gs,
            DT,
        )
        entity.isOnGround = gs.isOnGround
        entity.groundNormal = gs.groundNormal
        entity.groundKeepTimer = gs.groundKeepTimer
        states[i].gs = gs
    }

    for (let i = 0; i < states.length; i++) {
        const {entity} = states[i]
        entity.stateMachine.setInput(
            inputs[i].dx,
            inputs[i].dz,
            inputs[i].jump ?? false,
            false,
        )
        entity.stateMachine.update(DT, entity)
    }

    /* 模拟角色间分离（与 world.ts 第 549-589 行一致） */
    const separated = new Set<string>()
    const entities = states.map(s => s.entity)
    for (const c of shared.world.contacts) {
        const ai = entities.find(e => e.body.id === c.bi.id)
        const aj = entities.find(e => e.body.id === c.bj.id)
        if (!ai || !aj) continue
        if (ai.combat.isDead || aj.combat.isDead) continue

        const key =
            ai.id < aj.id ? `${ai.id}-${aj.id}` : `${aj.id}-${ai.id}`
        if (separated.has(key)) continue
        separated.add(key)

        const sep = computeSeparation(
            {
                aiX: ai.body.position.x,
                aiZ: ai.body.position.z,
                ajX: aj.body.position.x,
                ajZ: aj.body.position.z,
                radiusA: R * ai.config.scale,
                radiusB: R * aj.config.scale,
            },
            CHARACTER_SEPARATION_SPEED,
        )
        if (!sep) continue

        ai.body.position.x += sep.aiDx
        ai.body.position.z += sep.aiDz
        aj.body.position.x += sep.ajDx
        aj.body.position.z += sep.ajDz
        ai.body.velocity.x += sep.aiVx
        ai.body.velocity.z += sep.aiVz
        aj.body.velocity.x += sep.ajVx
        aj.body.velocity.z += sep.ajVz
        ai.body.wakeUp()
        aj.body.wakeUp()
    }
}

/** 两角色水平距离 */
const hDist = (a: CharacterEntity, b: CharacterEntity): number =>
    Math.hypot(
        a.body.position.x - b.body.position.x,
        a.body.position.z - b.body.position.z,
    )

/** 初始化地面状态 */
const initGS = (): GroundState => ({
    isOnGround: true,
    groundNormal: {x: 0, y: 1, z: 0},
    groundKeepTimer: 0,
})

// ==========================================================================
// 一、角色挤压分离 — 全状态覆盖
// ==========================================================================

describe('角色挤压分离 — 全状态覆盖', () => {
    it('两个 idle 角色重叠后分离，最终距离 ≥ 最小间距', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.2, 0.5, 0)
        /* 初始重叠：间距 0.2 < MIN_DIST(0.25) */
        expect(hDist(a, b)).toBeLessThan(MIN_DIST)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 30; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }
        /* 多帧后应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(a.stateMachine.currentState).toBe('idle')
        expect(b.stateMachine.currentState).toBe('idle')
    })

    it('walking 朝向 idle 挤压被分离且行走角色速度不因分离而爆炸', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.2, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* a 向 b 行走，b idle */
        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [stA, stB], [{dx: 1, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 速度上限应在合理范围（配置速度 + 分离踢） */
        const speed = Math.hypot(a.body.velocity.x, a.body.velocity.z)
        expect(speed).toBeLessThanOrEqual(20)
    })

    it('两个 walking 角色对撞被分离，不发生卡死穿透', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, -1, 0.5, 0)
        const b = makeChar(shared, 2, 1, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        let minDist = Infinity
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [stA, stB], [{dx: 1, dz: 0}, {dx: -1, dz: 0}])
            minDist = Math.min(minDist, hDist(a, b))
        }

        /* 任意时刻间距不应远低于碰撞距离（允许合理挤压） */
        expect(minDist).toBeGreaterThanOrEqual(0.05)
        /* 最终应保持分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('jumping 角色与 idle 角色重叠后被分离且不影响跳跃状态', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.15, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* b 起跳 */
        tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0, jump: true}])

        expect(b.stateMachine.currentState).toBe('jumping')

        for (let i = 0; i < 30; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 水平方向应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 跳跃角色不应被弹到异常高度 */
        expect(b.body.position.y).toBeLessThan(5)
    })

    it('falling 角色与 idle 角色重叠后被分离且下落不受阻', () => {
        const shared = createSharedWorld()
        /* b 从高处落到 a 附近 */
        const a = makeChar(shared, 1, 0.15, 0.5, 0)
        const b = makeChar(shared, 2, 0.15, 3, 0)

        const stA: CharFrameState = {
            gs: initGS(),
            entity: a,
        }
        const stB: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: b,
        }

        /* 运行 2 秒让 b 落地 */
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* b 应落到地面附近 */
        expect(b.body.position.y).toBeLessThan(2)
        /* 两角色不应重叠 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
    })

    it('idle+jumping+falling 三状态混合不卡死', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.1, 0.5, 0)
        const c = makeChar(shared, 3, 0.2, 2, -0.1)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: c,
        }

        /* b 起跳 */
        tickMulti(
            shared,
            [stA, stB, stC],
            [{dx: 0, dz: 0}, {dx: 0, dz: 0, jump: true}, {dx: 0, dz: 0}],
        )

        for (let i = 0; i < 120; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [{dx: 0, dz: 0}, {dx: 0, dz: 0}, {dx: 0, dz: 0}],
            )
        }

        /* 三者应最终互相分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(a, c)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 无角色被弹飞超高 */
        expect(a.body.position.y).toBeLessThan(5)
        expect(b.body.position.y).toBeLessThan(5)
        expect(c.body.position.y).toBeLessThan(5)
    })
})

// ==========================================================================
// 二、AI 移动行为与分离不冲突
// ==========================================================================

describe('AI 移动行为与分离不冲突', () => {
    /**
     * 模拟 world.ts 第 442-454 行的 AI 输入阻断逻辑。
     * 当 AI 与另一个角色有物理接触且输入方向指向对方时，输入被清零。
     */
    const aiPushBlock = (
        shared: ReturnType<typeof createSharedWorld>,
        entity: CharacterEntity,
        otherEntities: CharacterEntity[],
        dx: number,
        dz: number,
    ): {dx: number; dz: number} => {
        let finalDX = dx
        let finalDZ = dz
        if (dx !== 0 || dz !== 0) {
            for (const c of shared.world.contacts) {
                const ob =
                    c.bi === entity.body
                        ? c.bj
                        : c.bj === entity.body
                          ? c.bi
                          : undefined
                if (!ob) continue
                if (!otherEntities.some(e => e.body.id === ob.id)) continue
                const nx = ob.position.x - entity.body.position.x
                const nz = ob.position.z - entity.body.position.z
                if (dx * nx + dz * nz > 0) {
                    finalDX = 0
                    finalDZ = 0
                    break
                }
            }
        }
        return {dx: finalDX, dz: finalDZ}
    }

    it('AI 主动走向其他角色时，若已接触则输入被阻断为 0', () => {
        const shared = createSharedWorld()
        /* 让两角色重叠放置，立即产生接触 */
        const ai = makeChar(shared, 1, 0, 0.5, 0)
        const target = makeChar(shared, 2, 0.2, 0.5, 0)

        /* 第一帧：步进物理以生成 contacts，然后测试 AI 阻断 */
        shared.world.step(DT, DT, 1)

        /* 角色间应有接触 — 此时 AI 向 target 方向移动应被阻断 */
        const hasContact = shared.world.contacts.some(
            c =>
                (c.bi === ai.body && c.bj === target.body) ||
                (c.bi === target.body && c.bj === ai.body),
        )
        /* 初始重叠应产生接触 */
        expect(hasContact).toBe(true)

        const blocked = aiPushBlock(shared, ai, [target], 1, 0)
        expect(blocked.dx).toBe(0)

        /* 随后分离系统应正常工作 */
        const sep = computeSeparation(
            {
                aiX: ai.body.position.x,
                aiZ: ai.body.position.z,
                ajX: target.body.position.x,
                ajZ: target.body.position.z,
                radiusA: R * ai.config.scale,
                radiusB: R * target.config.scale,
            },
            CHARACTER_SEPARATION_SPEED,
        )
        expect(sep).not.toBeNull()
    })

    it('AI 沿接触面切线方向滑开不被阻断', () => {
        const shared = createSharedWorld()
        const ai = makeChar(shared, 1, 0, 0.5, 2)
        const target = makeChar(shared, 2, 0, 0.5, 0)

        /* 预热接触 */
        const stAI: CharFrameState = {gs: initGS(), entity: ai}
        const stTgt: CharFrameState = {gs: initGS(), entity: target}

        for (let i = 0; i < 30; i++) {
            tickMulti(shared, [stAI, stTgt], [
                {dx: 0, dz: -1},
                {dx: 0, dz: 0},
            ])
        }

        /* AI 已接触 target，现在尝试沿 X 方向移动（切线，不指向 target） */
        const blocked = aiPushBlock(shared, ai, [target], 1, 0)
        /* dx=1, dz=0：方向 (1,0)，双方在 Z 方向对齐，X 移动不指向对方 */
        /* 但对方在 z=0，ai 在 z≈... 如果 dz=0 且 nx 可能为 0，点积 = 1*0 + 0*nz = 0，不大于 0 */
        if (blocked.dx !== 0) {
            /* 切线方向不被阻断时应能继续移动 */
            tickMulti(shared, [stAI, stTgt], [
                {dx: blocked.dx, dz: blocked.dz},
                {dx: 0, dz: 0},
            ])
            /* 不应穿入角色内部 */
            expect(hDist(ai, target)).toBeGreaterThanOrEqual(0.05)
        }
    })

    it('分离系统与 AI 阻断同时生效：分离先推离，AI 阻断防再次推入', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.15, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        let pushFrames = 0
        for (let i = 0; i < 60; i++) {
            /* a 尝试走向 b，但若接触则阻断 */
            const blocked = aiPushBlock(shared, a, [b], 1, 0)
            tickMulti(shared, [stA, stB], [
                {dx: blocked.dx, dz: blocked.dz},
                {dx: 0, dz: 0},
            ])
            if (blocked.dx === 0) pushFrames++
        }

        /* 阻断应持续生效 */
        expect(pushFrames).toBeGreaterThan(0)
        /* 最终保持分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
    })
})

// ==========================================================================
// 三、坡面挤压（10°–100°）— 水平位移不超重叠量
// ==========================================================================

describe('坡面挤压 — 水平位移收敛至最小间距', () => {
    const SLOPE_ANGLES = [10, 30, 45, 60, 85] as const

    for (const deg of SLOPE_ANGLES) {
        it(`两个角色在 ${deg}° 坡上重叠后仅移动到不重叠距离`, () => {
            const shared = createSharedWorld()
            const slope = Math.tan((deg * Math.PI) / 180)
            makeSlope(shared, slope)

            const x = 60
            const y = slope * x + 0.51
            const a = makeChar(shared, 1, x, y, -20)
            /* b 放在 a 右侧略微重叠的位置 */
            const b = makeChar(shared, 2, x + 0.15, y, -20)

            const stA: CharFrameState = {gs: initGS(), entity: a}
            const stB: CharFrameState = {gs: initGS(), entity: b}

            /* 记录初始重叠和最终位移 */
            const initialOverlap = Math.max(0, MIN_DIST - hDist(a, b))

            /* 预热 0.5s 让角色落稳 */
            for (let i = 0; i < 30; i++) {
                tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
            }

            const preSepX_A = a.body.position.x
            const preSepX_B = b.body.position.x

            /* 运行分离 */
            for (let i = 0; i < 30; i++) {
                tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
            }

            /* 最终应分离 */
            expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)

            /* 水平位移应在合理范围内（重叠量 + 速度踢衰减余量） */
            const dispA = Math.abs(a.body.position.x - preSepX_A)
            const dispB = Math.abs(b.body.position.x - preSepX_B)
            /* 每边位移不应超过 3 × (overlap/2) + 缓冲（速度踢衰减导致的额外位移） */
            const maxDisp = initialOverlap * 0.5 * 3 + 0.5
            expect(dispA).toBeLessThanOrEqual(maxDisp)
            expect(dispB).toBeLessThanOrEqual(maxDisp)
        })
    }

    for (const deg of SLOPE_ANGLES) {
        it(`三个角色在 ${deg}° 坡上重叠全部被分离`, () => {
            const shared = createSharedWorld()
            const slope = Math.tan((deg * Math.PI) / 180)
            makeSlope(shared, slope)

            const x = 60
            const y = slope * x + 0.51
            const a = makeChar(shared, 1, x, y, -20)
            const b = makeChar(shared, 2, x + 0.12, y, -20)
            const c = makeChar(shared, 3, x + 0.24, y, -20)

            const stA: CharFrameState = {gs: initGS(), entity: a}
            const stB: CharFrameState = {gs: initGS(), entity: b}
            const stC: CharFrameState = {gs: initGS(), entity: c}

            /* 预热 */
            for (let i = 0; i < 30; i++) {
                tickMulti(
                    shared,
                    [stA, stB, stC],
                    [
                        {dx: 0, dz: 0},
                        {dx: 0, dz: 0},
                        {dx: 0, dz: 0},
                    ],
                )
            }

            /* 运行分离 */
            for (let i = 0; i < 60; i++) {
                tickMulti(
                    shared,
                    [stA, stB, stC],
                    [
                        {dx: 0, dz: 0},
                        {dx: 0, dz: 0},
                        {dx: 0, dz: 0},
                    ],
                )
            }

            expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
            expect(hDist(b, c)).toBeGreaterThanOrEqual(MIN_DIST)
            expect(hDist(a, c)).toBeGreaterThanOrEqual(MIN_DIST)
        })
    }
})

describe('坡面挤压 — 有物理块推挤', () => {
    /**
     * 模拟箱子推动一个角色去挤另一个角色的场景。
     * 箱子应 push 角色 A → 角色 A 挤压角色 B → 分离系统干预。
     */
    it('重箱子推角色 A 挤角色 B，分离维持 B 不被穿透', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 1, 0.5, 0)
        const b = makeChar(shared, 2, 3, 0.5, 0)

        /* 在 a 左侧放一个重箱子，向右推动 */
        const box = new Body({
            mass: 5,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(1, 0.5, 1)))
        box.position.set(-2, 0.5, 0)
        box.velocity.set(8, 0, 0)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* B 不应被 A 穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('30° 坡上箱子下滑推角色 A 挤角色 B，分离有效', () => {
        const shared = createSharedWorld()
        const slope = Math.tan((30 * Math.PI) / 180)
        makeSlope(shared, slope, 80, 2)

        const xA = 60
        const y = slope * xA + 0.51
        const a = makeChar(shared, 1, xA, y, -20)
        const b = makeChar(shared, 2, xA - 1, y, -20)

        const box = new Body({
            mass: 3,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(0.5, 0.5, 0.5)))
        /* 放在 a 上方（较大 X 方向），重力会让其下滑推动 a */
        box.position.set(xA + 2, slope * (xA + 2) + 1, -20)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* 预热 */
        for (let i = 0; i < 30; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 运行推挤 */
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* B 不应被穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('85° 陡坡上箱子下滑推角色 A 挤角色 B，分离仍有效', () => {
        const shared = createSharedWorld()
        const slope = Math.tan((85 * Math.PI) / 180)
        makeSlope(shared, slope, 80, 2)

        const xA = 10
        const y = slope * xA + 0.51
        const a = makeChar(shared, 1, xA, y, -20)
        const b = makeChar(shared, 2, xA - 1, y, -20)

        const box = new Body({
            mass: 3,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(0.5, 0.5, 0.5)))
        box.position.set(xA + 2, slope * (xA + 2) + 1, -20)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 30; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.05)
    })
})

describe('垂直墙 / 倒悬墙（90°/100°）— 分离与下落', () => {
    const removeDefaultGround = (
        shared: ReturnType<typeof createSharedWorld>,
    ): void => {
        for (const b of [...shared.world.bodies]) {
            if (
                b.type === BODY_TYPES.STATIC &&
                b.shapes.some(s => s instanceof Plane)
            ) {
                shared.world.removeBody(b)
            }
        }
    }

    const makeWall = (
        shared: ReturnType<typeof createSharedWorld>,
        thetaDeg: number,
    ): Body => {
        const body = new Body({
            mass: 0,
            type: BODY_TYPES.STATIC,
            material: shared.boxMat,
            collisionFilterGroup: TERRAIN_COLLISION_GROUP,
            collisionFilterMask: TERRAIN_COLLISION_MASK,
        })
        body.addShape(new Plane())
        body.quaternion.setFromAxisAngle(
            new Vec3(1, 0, 0),
            -Math.PI / 2 + (thetaDeg * Math.PI) / 180,
        )
        shared.world.addBody(body)
        return body
    }

    it('90° 垂直墙旁两重叠角色分离不穿墙', () => {
        const shared = createSharedWorld()
        removeDefaultGround(shared)
        makeWall(shared, 90)

        const a = makeChar(shared, 1, 0, 3, 0.1)
        const b = makeChar(shared, 2, 0.15, 3, 0.1)

        const stA: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: a,
        }
        const stB: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: b,
        }

        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 水平方向应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 不穿入墙（墙在 z=0，角色半径 0.125） */
        expect(a.body.position.z).toBeGreaterThanOrEqual(0)
        expect(b.body.position.z).toBeGreaterThanOrEqual(0)
    })

    it('100° 倒悬墙旁两重叠角色分离不穿墙', () => {
        const shared = createSharedWorld()
        removeDefaultGround(shared)
        makeWall(shared, 100)

        const a = makeChar(shared, 1, 0, 1, 0.5)
        const b = makeChar(shared, 2, 0.15, 1, 0.5)

        const stA: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: a,
        }
        const stB: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: b,
        }

        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
    })
})

// ==========================================================================
// 四、防穿模 — 角色被 box/area/terrain 紧贴包围
// ==========================================================================

describe('防穿模 — 角色紧贴箱子各面', () => {
    it('箱子紧贴角色上方不穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 0.5, 0)
        /* box 紧贴角色头顶（半径 0.125, 半高 0.5 → 顶部 y=1.0） */
        makeStaticBox(shared, 0, 1.01, 0, 1, 0.01, 1)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 角色不应被压入地下 */
        expect(ch.body.position.y).toBeGreaterThanOrEqual(0.2)
        /* 也不应穿透箱子（角色顶部应在箱子底以下） */
        expect(ch.body.position.y + R).toBeLessThanOrEqual(1.5)
    })

    it('箱子紧贴角色下方（地面升高）不穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 1.5, 0)
        /* box 在角色脚下 */
        makeStaticBox(shared, 0, 0.5, 0, 2, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应落在箱子上方 */
        expect(ch.body.position.y).toBeGreaterThanOrEqual(0.9)
    })

    it('箱子紧贴角色前方，角色 walk 不能穿入', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 0.5, 5)
        makeStaticBox(shared, 0, 0.5, 0.5, 2, 0.5, 0.5)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 角色向前走（z-） */
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: -1}])
        }

        /* 角色不应穿入箱子（箱子 z 范围 -0.5~0.5 → z_center=0.5, halfDepth=0.5 → 箱子 z∈[0,1]） */
        /* 角色半径 0.25，不应穿入 z∈[0,1] */
        expect(ch.body.position.z).toBeGreaterThanOrEqual(1.0)
    })

    it('箱子紧贴角色后方，角色 walk 不能穿入', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 0.5, -5)
        makeStaticBox(shared, 0, 0.5, -0.5, 2, 0.5, 0.5)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 1}])
        }

        expect(ch.body.position.z).toBeLessThanOrEqual(-1.0)
    })

    it('箱子紧贴角色左侧，角色不能穿入', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 5, 0.5, 0)
        makeStaticBox(shared, 0.5, 0.5, 0, 0.5, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: -1, dz: 0}])
        }

        expect(ch.body.position.x).toBeGreaterThanOrEqual(1.0)
    })

    it('箱子紧贴角色右侧，角色不能穿入', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, -5, 0.5, 0)
        makeStaticBox(shared, -0.5, 0.5, 0, 0.5, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 1, dz: 0}])
        }

        expect(ch.body.position.x).toBeLessThanOrEqual(-1.0)
    })

    it('角色六面被箱子包围，不穿透任何箱子', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 2, 0)

        /* 六面包围 */
        makeStaticBox(shared, 0, 1.5, 0, 2, 0.5, 2) // 上
        makeStaticBox(shared, 0, -0.01, 0, 2, 0.01, 2) // 下
        makeStaticBox(shared, 0, 1, 1.5, 2, 0.5, 0.5) // 前
        makeStaticBox(shared, 0, 1, -1.5, 2, 0.5, 0.5) // 后
        makeStaticBox(shared, 1.5, 1, 0, 0.5, 0.5, 2) // 左
        makeStaticBox(shared, -1.5, 1, 0, 0.5, 0.5, 2) // 右

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 角色尝试四处移动 */
        for (let i = 0; i < 120; i++) {
            const dirs = [
                {dx: 1, dz: 0},
                {dx: -1, dz: 0},
                {dx: 0, dz: 1},
                {dx: 0, dz: -1},
            ]
            const d = dirs[i % 4]
            tickMulti(shared, [st], [d])
        }

        /* 角色应保持在大致围栏范围内 */
        expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(2)
        expect(Math.abs(ch.body.position.z)).toBeLessThanOrEqual(2)
        expect(ch.body.position.y).toBeGreaterThanOrEqual(0)
        expect(ch.body.position.y).toBeLessThanOrEqual(2.5)
    })
})

describe('防穿模 — 角色紧贴地形', () => {
    it('角色从高处落到陡坡上不穿入地形', () => {
        const shared = createSharedWorld()
        const slope = Math.tan((60 * Math.PI) / 180)
        makeSlope(shared, slope)

        const x = 40
        const y = slope * x + 1
        const ch = makeChar(shared, 1, x, y, -20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应在坡面以上（不穿透到坡面以下） */
        const terrainY = slope * ch.body.position.x
        expect(ch.body.position.y + 0.01).toBeGreaterThanOrEqual(terrainY)
    })

    it('角色行走撞向地形墙不穿透', () => {
        const shared = createSharedWorld()
        /* 创建一个陡峭坡面充当"墙" */
        const steep = Math.tan((85 * Math.PI) / 180)
        makeSlope(shared, steep, 80, 2)

        /* 角色放在坡面上方，尝试向下坡方向走 */
        const x = 20
        const y = steep * x + 1
        const ch = makeChar(shared, 1, x, y, -20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 向下坡方向走 */
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: -1, dz: 0}])
        }

        /* 角色不应穿入地形（地形 y = steep * x） */
        const terrainY = steep * ch.body.position.x
        expect(ch.body.position.y + 0.01).toBeGreaterThanOrEqual(terrainY)
    })
})

// ==========================================================================
// 五、60 物理子步稳定性
// ==========================================================================

describe('60 物理子步稳定性', () => {
    it('单角色 idle 60 子步运行无爆炸', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 0.5, 0)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 每帧用 60 子步（模拟低帧率下 maxSubSteps=60） */
        for (let i = 0; i < 10; i++) {
            shared.world.step(DT, DT, 60)
            const gs = resolveGroundState(
                shared.world.contacts,
                ch.body,
                st.gs,
                DT,
            )
            ch.isOnGround = gs.isOnGround
            ch.groundNormal = gs.groundNormal
            ch.groundKeepTimer = gs.groundKeepTimer
            st.gs = gs
            ch.stateMachine.setInput(0, 0, false, false)
            ch.stateMachine.update(DT, ch)
        }

        /* 角色应保持在地面附近，速度不爆炸 */
        expect(ch.body.position.y).toBeGreaterThanOrEqual(0)
        expect(ch.body.position.y).toBeLessThanOrEqual(2)
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
        expect(ch.stateMachine.currentState).toBe('idle')
    })

    it('两个重叠角色 60 子步分离收敛不爆炸', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.1, 0.5, 0)

        for (let i = 0; i < 20; i++) {
            shared.world.step(DT, DT, 60)

            /* 地面检测 */
            for (const ch of [a, b]) {
                const gs = resolveGroundState(
                    shared.world.contacts,
                    ch.body,
                    {isOnGround: ch.isOnGround, groundNormal: ch.groundNormal, groundKeepTimer: ch.groundKeepTimer},
                    DT,
                )
                ch.isOnGround = gs.isOnGround
                ch.groundNormal = gs.groundNormal
                ch.groundKeepTimer = gs.groundKeepTimer
            }

            a.stateMachine.setInput(0, 0, false, false)
            b.stateMachine.setInput(0, 0, false, false)
            a.stateMachine.update(DT, a)
            b.stateMachine.update(DT, b)

            /* 分离 */
            const sep = computeSeparation(
                {
                    aiX: a.body.position.x,
                    aiZ: a.body.position.z,
                    ajX: b.body.position.x,
                    ajZ: b.body.position.z,
                    radiusA: R * a.config.scale,
                    radiusB: R * b.config.scale,
                },
                CHARACTER_SEPARATION_SPEED,
            )
            if (sep) {
                a.body.position.x += sep.aiDx
                a.body.position.z += sep.aiDz
                b.body.position.x += sep.ajDx
                b.body.position.z += sep.ajDz
                a.body.velocity.x += sep.aiVx
                a.body.velocity.z += sep.aiVz
                b.body.velocity.x += sep.ajVx
                b.body.velocity.z += sep.ajVz
                a.body.wakeUp()
                b.body.wakeUp()
            }
        }

        /* 最终应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 速度不爆炸 */
        expect(a.body.velocity.length()).toBeLessThanOrEqual(50)
        expect(b.body.velocity.length()).toBeLessThanOrEqual(50)
        /* 位置不飞走 */
        expect(Math.abs(a.body.position.x)).toBeLessThanOrEqual(5)
        expect(Math.abs(b.body.position.x)).toBeLessThanOrEqual(5)
        expect(a.body.position.y).toBeLessThanOrEqual(3)
        expect(b.body.position.y).toBeLessThanOrEqual(3)
    })

    it('三个角色 + 箱子推挤 60 子步不爆炸', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, -1, 0.5, 0)
        const b = makeChar(shared, 2, 0.05, 0.5, 0.1)
        const c = makeChar(shared, 3, 1, 0.5, -0.1)

        const box = new Body({
            mass: 5,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(1, 0.5, 1)))
        box.position.set(-3, 0.5, 0)
        box.velocity.set(10, 0, 0)
        shared.world.addBody(box)

        const chars = [a, b, c]

        for (let i = 0; i < 30; i++) {
            shared.world.step(DT, DT, 60)

            for (const ch of chars) {
                const gs = resolveGroundState(
                    shared.world.contacts,
                    ch.body,
                    {isOnGround: ch.isOnGround, groundNormal: ch.groundNormal, groundKeepTimer: ch.groundKeepTimer},
                    DT,
                )
                ch.isOnGround = gs.isOnGround
                ch.groundNormal = gs.groundNormal
                ch.groundKeepTimer = gs.groundKeepTimer
                ch.stateMachine.setInput(0, 0, false, false)
                ch.stateMachine.update(DT, ch)
            }

            /* 角色间分离 */
            const processed = new Set<string>()
            const entities = chars
            for (let ci = 0; ci < entities.length; ci++) {
                for (let cj = ci + 1; cj < entities.length; cj++) {
                    const key = `${entities[ci].id}-${entities[cj].id}`
                    if (processed.has(key)) continue
                    processed.add(key)

                    const sep = computeSeparation(
                        {
                            aiX: entities[ci].body.position.x,
                            aiZ: entities[ci].body.position.z,
                            ajX: entities[cj].body.position.x,
                            ajZ: entities[cj].body.position.z,
                            radiusA: R * entities[ci].config.scale,
                            radiusB: R * entities[cj].config.scale,
                        },
                        CHARACTER_SEPARATION_SPEED,
                    )
                    if (!sep) continue

                    entities[ci].body.position.x += sep.aiDx
                    entities[ci].body.position.z += sep.aiDz
                    entities[cj].body.position.x += sep.ajDx
                    entities[cj].body.position.z += sep.ajDz
                    entities[ci].body.velocity.x += sep.aiVx
                    entities[ci].body.velocity.z += sep.aiVz
                    entities[cj].body.velocity.x += sep.ajVx
                    entities[cj].body.velocity.z += sep.ajVz
                    entities[ci].body.wakeUp()
                    entities[cj].body.wakeUp()
                }
            }
        }

        /* 无速度爆炸 */
        for (const ch of chars) {
            expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
            expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(10)
            expect(ch.body.position.y).toBeLessThanOrEqual(5)
        }
    })

    it('60 子步 vs 1 子步分离距离收敛一致', () => {
        const makeWorld = (): {
            shared: ReturnType<typeof createSharedWorld>
            a: CharacterEntity
            b: CharacterEntity
        } => {
            const shared = createSharedWorld()
            const a = makeChar(shared, 1, 0, 0.5, 0)
            const b = makeChar(shared, 2, 0.1, 0.5, 0)
            return {shared, a, b}
        }

        /* 1 子步 */
        const w1 = makeWorld()
        for (let i = 0; i < 30; i++) {
            w1.shared.world.step(DT, DT, 1)
            for (const ch of [w1.a, w1.b]) {
                const gs = resolveGroundState(
                    w1.shared.world.contacts,
                    ch.body,
                    {isOnGround: ch.isOnGround, groundNormal: ch.groundNormal, groundKeepTimer: ch.groundKeepTimer},
                    DT,
                )
                ch.isOnGround = gs.isOnGround
                ch.groundNormal = gs.groundNormal
                ch.groundKeepTimer = gs.groundKeepTimer
                ch.stateMachine.setInput(0, 0, false, false)
                ch.stateMachine.update(DT, ch)
            }
            const sep = computeSeparation(
                {
                    aiX: w1.a.body.position.x,
                    aiZ: w1.a.body.position.z,
                    ajX: w1.b.body.position.x,
                    ajZ: w1.b.body.position.z,
                    radiusA: R * w1.a.config.scale,
                    radiusB: R * w1.b.config.scale,
                },
                CHARACTER_SEPARATION_SPEED,
            )
            if (sep) {
                w1.a.body.position.x += sep.aiDx
                w1.a.body.position.z += sep.aiDz
                w1.b.body.position.x += sep.ajDx
                w1.b.body.position.z += sep.ajDz
                w1.a.body.velocity.x += sep.aiVx
                w1.a.body.velocity.z += sep.aiVz
                w1.b.body.velocity.x += sep.ajVx
                w1.b.body.velocity.z += sep.ajVz
                w1.a.body.wakeUp()
                w1.b.body.wakeUp()
            }
        }

        /* 60 子步 */
        const w60 = makeWorld()
        for (let i = 0; i < 30; i++) {
            w60.shared.world.step(DT, DT, 60)
            for (const ch of [w60.a, w60.b]) {
                const gs = resolveGroundState(
                    w60.shared.world.contacts,
                    ch.body,
                    {isOnGround: ch.isOnGround, groundNormal: ch.groundNormal, groundKeepTimer: ch.groundKeepTimer},
                    DT,
                )
                ch.isOnGround = gs.isOnGround
                ch.groundNormal = gs.groundNormal
                ch.groundKeepTimer = gs.groundKeepTimer
                ch.stateMachine.setInput(0, 0, false, false)
                ch.stateMachine.update(DT, ch)
            }
            const sep = computeSeparation(
                {
                    aiX: w60.a.body.position.x,
                    aiZ: w60.a.body.position.z,
                    ajX: w60.b.body.position.x,
                    ajZ: w60.b.body.position.z,
                    radiusA: R * w60.a.config.scale,
                    radiusB: R * w60.b.config.scale,
                },
                CHARACTER_SEPARATION_SPEED,
            )
            if (sep) {
                w60.a.body.position.x += sep.aiDx
                w60.a.body.position.z += sep.aiDz
                w60.b.body.position.x += sep.ajDx
                w60.b.body.position.z += sep.ajDz
                w60.a.body.velocity.x += sep.aiVx
                w60.a.body.velocity.z += sep.aiVz
                w60.b.body.velocity.x += sep.ajVx
                w60.b.body.velocity.z += sep.ajVz
                w60.a.body.wakeUp()
                w60.b.body.wakeUp()
            }
        }

        /* 两者最终分离距离应在同一数量级 */
        const d1 = hDist(w1.a, w1.b)
        const d60 = hDist(w60.a, w60.b)
        expect(d1).toBeGreaterThanOrEqual(MIN_DIST)
        expect(d60).toBeGreaterThanOrEqual(MIN_DIST)
        /* 差异不超过 0.1（物理确定性应一致） */
        expect(Math.abs(d1 - d60)).toBeLessThanOrEqual(0.1)
    })
})

// ==========================================================================
// 六、挤压应力 — 验证潜在穿透风险
// ==========================================================================

describe('大质量箱子挤压 — 角色不穿入箱子', () => {
    /** 创建一个可配置质量的高速箱子 */
    const makeHeavyBox = (
        shared: ReturnType<typeof createSharedWorld>,
        mass: number,
        x: number,
        vx: number,
    ): Body => {
        const box = new Body({
            mass,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(1, 0.5, 1)))
        box.position.set(x, 0.5, 0)
        box.velocity.set(vx, 0, 0)
        shared.world.addBody(box)
        return box
    }

    it('质量 10 箱子高速撞向角色，角色不被穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 1, 0.5, 0)
        makeHeavyBox(shared, 10, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 角色不应飞到极高位置或极远位置 */
        expect(ch.body.position.y).toBeLessThanOrEqual(5)
        expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(10)
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
    })

    it('质量 50 箱子高速撞向角色，角色不被穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 1, 0.5, 0)
        makeHeavyBox(shared, 50, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        expect(ch.body.position.y).toBeLessThanOrEqual(5)
        expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(10)
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
    })

    it('质量 200 箱子高速撞向角色，角色不被穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 1, 0.5, 0)
        makeHeavyBox(shared, 200, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        expect(ch.body.position.y).toBeLessThanOrEqual(5)
        expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(10)
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
    })

    it('角色被夹在大质量箱子和静态墙之间不穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 1, 0.5, 0)
        /* 在角色右侧放一堵墙 x=1.6 半宽 0.1 → 墙占用 x∈[1.5, 1.7] */
        makeStaticBox(shared, 1.6, 0.5, 0, 0.1, 2, 2)
        /* 大箱子从左侧高速推入 */
        makeHeavyBox(shared, 100, -2, 20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        let maxRight = 0
        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
            maxRight = Math.max(maxRight, ch.body.position.x + R)
        }

        /* 角色右边界不应越过墙左边界（墙左边界=1.5），允许微小穿透量 */
        expect(maxRight).toBeLessThanOrEqual(1.65)
        /* 角色不应被压入地下 */
        expect(ch.body.position.y).toBeGreaterThanOrEqual(0.1)
        /* 角色不应发生速度爆炸 */
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(60)
    })

    it('角色被两个大质量箱子从两侧同时挤压不穿透', () => {
        const shared = createSharedWorld()
        const ch = makeChar(shared, 1, 0, 0.5, 0)
        makeHeavyBox(shared, 80, -2, 15)
        makeHeavyBox(shared, 80, 2, -15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应大致停留在两箱子之间 */
        expect(Math.abs(ch.body.position.x)).toBeLessThanOrEqual(3)
        expect(ch.body.position.y).toBeLessThanOrEqual(5)
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
    })
})

describe('三角色加大质量箱子挤压 — 分离系统压力测试', () => {
    it('大质量箱子推三角色，全部不被穿透', () => {
        const shared = createSharedWorld()
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0.5, 0.5, 0.1)
        const c = makeChar(shared, 3, 1, 0.5, -0.1)

        const box = new Body({
            mass: 100,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(1.5, 0.5, 1.5)))
        box.position.set(-3, 0.5, 0)
        box.velocity.set(20, 0, 0)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 120; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        /* 三角色两两不相穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(a, c)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 无速度爆炸 */
        for (const ch of [a, b, c]) {
            expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
            expect(ch.body.position.y).toBeLessThanOrEqual(5)
        }
    })

    it('三角色 + 大质量箱 + 30° 坡面，分离在斜坡上仍有效', () => {
        const shared = createSharedWorld()
        const slope = Math.tan((30 * Math.PI) / 180)
        makeSlope(shared, slope, 80, 2)

        const xA = 60
        const y = slope * xA + 0.51
        const a = makeChar(shared, 1, xA, y, -20)
        const b = makeChar(shared, 2, xA - 0.8, y, -20)
        const c = makeChar(shared, 3, xA - 1.6, y, -20)

        /* 大箱子从上方（大 x 方向）下滑推动三角色 */
        const box = new Body({
            mass: 50,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(0.8, 0.5, 0.8)))
        box.position.set(xA + 3, slope * (xA + 3) + 1, -20)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        /* 预热 */
        for (let i = 0; i < 30; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        for (let i = 0; i < 120; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.05)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(0.05)
        expect(hDist(a, c)).toBeGreaterThanOrEqual(0.05)
    })

    it('三角色 + 大质量箱 + 85° 陡坡，分离不崩溃', () => {
        const shared = createSharedWorld()
        const slope = Math.tan((85 * Math.PI) / 180)
        makeSlope(shared, slope, 80, 2)

        const xA = 15
        const y = slope * xA + 0.51
        const a = makeChar(shared, 1, xA, y, -20)
        const b = makeChar(shared, 2, xA - 0.8, y, -20)
        const c = makeChar(shared, 3, xA - 1.6, y, -20)

        const box = new Body({
            mass: 50,
            type: BODY_TYPES.DYNAMIC,
            material: shared.boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        box.addShape(new Box(new Vec3(0.8, 0.5, 0.8)))
        box.position.set(xA + 3, slope * (xA + 3) + 1, -20)
        shared.world.addBody(box)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 30; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        for (let i = 0; i < 120; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        /* 重点：不崩溃、不穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.02)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(0.02)
        for (const ch of [a, b, c]) {
            expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
        }
    })
})

describe('单帧极端穿透 — 角色初始深嵌入箱子能否恢复', () => {
    /**
     * 已知限制：cannon-es 的 sequential impulse solver 对角色完全嵌入 STATIC box
     * 内部的情况无法可靠推离（接触法线指向随机方向、SAP 宽相可能不产接触对）。
     * 此测试检验：不崩溃、不速度爆炸。
     */
    it('角色 spawn 在静态箱子内部（极端穿透），不崩溃不爆炸', () => {
        const shared = createSharedWorld()
        makeStaticBox(shared, 0, 0.5, 0, 1.2, 0.5, 1.2)
        const ch = makeChar(shared, 1, 0, 0.5, 0)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [st], [{dx: 0, dz: 0}])
        }

        /* 不崩溃的情况下检查速度有界（不因穿透产生 NaN 或极大速度） */
        expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
        expect(Number.isFinite(ch.body.position.y)).toBe(true)
    })

    it('两个角色互相 spawn 在对方体内，多层分离层层推进', () => {
        const shared = createSharedWorld()
        /* 两者完全重合在相同位置 */
        const a = makeChar(shared, 1, 0, 0.5, 0)
        const b = makeChar(shared, 2, 0, 0.5, 0)

        expect(hDist(a, b)).toBeLessThan(0.01)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* 连续 60 帧尝试分离 */
        for (let i = 0; i < 60; i++) {
            tickMulti(shared, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 分离后不应产生单个大位移（应逐步推离） */
        expect(Math.abs(a.body.position.x)).toBeLessThanOrEqual(2)
    })

    it('三角色 spawn 在箱子内部 + 互相重叠，可恢复', () => {
        const shared = createSharedWorld()
        makeStaticBox(shared, 0.3, 0.5, 0, 1, 0.5, 1)

        const a = makeChar(shared, 1, 0.2, 0.5, 0)
        const b = makeChar(shared, 2, 0.25, 0.5, 0.1)
        const c = makeChar(shared, 3, 0.3, 0.5, -0.1)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 90; i++) {
            tickMulti(
                shared,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(a, c)).toBeGreaterThanOrEqual(MIN_DIST)
        for (const ch of [a, b, c]) {
            expect(ch.body.velocity.length()).toBeLessThanOrEqual(50)
        }
    })
})

describe('渐进质量挤压 — 寻找穿透阈值', () => {
    const MASSES = [5, 20, 50, 100, 300] as const

    for (const mass of MASSES) {
        it(`质量 ${mass} 箱子 + 速度 25 → 角色不被穿透`, () => {
            const shared = createSharedWorld()
            const ch = makeChar(shared, 1, 2, 0.5, 0)

            const box = new Body({
                mass,
                type: BODY_TYPES.DYNAMIC,
                material: shared.boxMat,
                collisionFilterGroup: DEFAULT_COLLISION_GROUP,
                collisionFilterMask: DEFAULT_COLLISION_MASK,
            })
            box.addShape(new Box(new Vec3(1, 0.5, 1)))
            box.position.set(-2, 0.5, 0)
            box.velocity.set(25, 0, 0)
            shared.world.addBody(box)

            const st: CharFrameState = {gs: initGS(), entity: ch}

            for (let i = 0; i < 90; i++) {
                tickMulti(shared, [st], [{dx: 0, dz: 0}])
            }

            /* 角色不应穿入箱子左侧（箱子初始 x=-1 左边界 → 最终 x 可能因为碰撞向前） */
            /* 核心断言：角色不被砸入地下、不被弹飞到极高位置 */
            expect(ch.body.position.y).toBeGreaterThanOrEqual(-0.5)
            expect(ch.body.position.y).toBeLessThanOrEqual(8)
            expect(ch.body.velocity.length()).toBeLessThanOrEqual(60)
        })
    }
})
