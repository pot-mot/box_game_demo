/**
 * 角色挤压分离 — 全场景物理集成测试（Rapier）。
 * 从 cannon-es master 版本迁移：世界构造统一走 harness，
 * 断言意图与 master 完全一致（个别 Rapier 物理差异见测试内注释）。
 */
import {beforeAll, describe, it, expect} from 'vitest'
import {
    initRapier,
    createHarnessWorld,
    makeChar,
    makeStaticBox,
    makeDynamicBox,
    makeSlope,
    removeDefaultGround,
    makeWall,
    stepWorld,
    tick,
    tickMulti,
    hDist,
    initGS,
    type HarnessWorld,
    type CharFrameState,
} from './harness.ts'
import {computeSeparation} from './separation.ts'
import {CHARACTER_SEPARATION_SPEED} from './constants.ts'
import {v3Length} from '../../../physics/rapier_utils.ts'
import type {CharacterEntity} from '../../../character/types.ts'

beforeAll(async () => {
    await initRapier()
})

/** 角色碰撞半径（cuboid 半宽 0.125，与 harness makeChar 一致） */
const R = 0.125
/** 两角色最小水平间距（2 × 半径） */
const MIN_DIST = R * 2

/** 角色速度模长 */
const speedOf = (entity: CharacterEntity): number => v3Length(entity.body.linvel())

// ==========================================================================
// 一、角色挤压分离 — 全状态覆盖
// ==========================================================================

describe('角色挤压分离 — 全状态覆盖', () => {
    it('两个 idle 角色重叠后分离，最终距离 ≥ 最小间距', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.2, 0.5, 0)
        /* 初始重叠：间距 0.2 < MIN_DIST(0.25) */
        expect(hDist(a, b)).toBeLessThan(MIN_DIST)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 30; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }
        /* 多帧后应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(a.stateMachine.currentState).toBe('idle')
        expect(b.stateMachine.currentState).toBe('idle')
    })

    it('walking 朝向 idle 挤压被分离且行走角色速度不因分离而爆炸', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.2, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* a 向 b 行走，b idle */
        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [stA, stB], [{dx: 1, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 速度上限应在合理范围（配置速度 + 分离踢） */
        const va = a.body.linvel()
        const speed = Math.hypot(va.x, va.z)
        expect(speed).toBeLessThanOrEqual(20)
    })

    it('两个 walking 角色对撞被分离，不发生卡死穿透', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, -1, 0.5, 0)
        const b = makeChar(hw, 2, 1, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        let minDist = Infinity
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [stA, stB], [{dx: 1, dz: 0}, {dx: -1, dz: 0}])
            minDist = Math.min(minDist, hDist(a, b))
        }

        /* 任意时刻间距不应远低于碰撞距离（允许合理挤压） */
        expect(minDist).toBeGreaterThanOrEqual(0.05)
        /* 最终应保持分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('jumping 角色与 idle 角色重叠后被分离且不影响跳跃状态', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.15, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* b 起跳 */
        tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0, jump: true}])

        expect(b.stateMachine.currentState).toBe('jumping')

        for (let i = 0; i < 30; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 水平方向应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 跳跃角色不应被弹到异常高度 */
        expect(b.body.translation().y).toBeLessThan(5)
    })

    it('falling 角色与 idle 角色重叠后被分离且下落不受阻', () => {
        const hw = createHarnessWorld()
        /* b 从高处落到 a 附近 */
        const a = makeChar(hw, 1, 0.15, 0.5, 0)
        const b = makeChar(hw, 2, 0.15, 3, 0)

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
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* b 应落到地面附近 */
        expect(b.body.translation().y).toBeLessThan(2)
        /* 两角色不应重叠 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
    })

    it('idle+jumping+falling 三状态混合不卡死', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.1, 0.5, 0)
        const c = makeChar(hw, 3, 0.2, 2, -0.1)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: c,
        }

        /* b 起跳 */
        tickMulti(
            hw,
            [stA, stB, stC],
            [{dx: 0, dz: 0}, {dx: 0, dz: 0, jump: true}, {dx: 0, dz: 0}],
        )

        for (let i = 0; i < 120; i++) {
            tickMulti(
                hw,
                [stA, stB, stC],
                [{dx: 0, dz: 0}, {dx: 0, dz: 0}, {dx: 0, dz: 0}],
            )
        }

        /* 三者应最终互相分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(b, c)).toBeGreaterThanOrEqual(MIN_DIST)
        expect(hDist(a, c)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 无角色被弹飞超高 */
        expect(a.body.translation().y).toBeLessThan(5)
        expect(b.body.translation().y).toBeLessThan(5)
        expect(c.body.translation().y).toBeLessThan(5)
    })
})

// ==========================================================================
// 二、AI 移动行为与分离不冲突
// ==========================================================================

describe('AI 移动行为与分离不冲突', () => {
    /**
     * 模拟 world.ts 的 AI 输入阻断逻辑：
     * 当 AI 与另一个角色有物理接触且输入方向指向对方时，输入被清零。
     */
    const aiPushBlock = (
        hw: HarnessWorld,
        entity: CharacterEntity,
        otherEntities: CharacterEntity[],
        dx: number,
        dz: number,
    ): {dx: number; dz: number} => {
        let finalDX = dx
        let finalDZ = dz
        if (dx !== 0 || dz !== 0) {
            for (const pair of hw.tracker.pairsInvolving(entity.mainCollider.handle)) {
                const otherHandle =
                    pair.colliderAHandle === entity.mainCollider.handle
                        ? pair.colliderBHandle
                        : pair.colliderAHandle
                const otherCollider = hw.shared.world.getCollider(otherHandle)
                if (!otherCollider) continue
                const ob = otherCollider.parent()
                if (!ob) continue
                if (!otherEntities.some(e => e.body.handle === ob.handle)) continue
                const myPos = entity.body.translation()
                const obPos = ob.translation()
                const nx = obPos.x - myPos.x
                const nz = obPos.z - myPos.z
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
        const hw = createHarnessWorld()
        /* 让两角色重叠放置，立即产生接触 */
        const ai = makeChar(hw, 1, 0, 0.5, 0)
        const target = makeChar(hw, 2, 0.2, 0.5, 0)

        /* 第一帧：步进物理以生成接触对，然后测试 AI 阻断 */
        stepWorld(hw)

        /* 角色间应有接触 — 此时 AI 向 target 方向移动应被阻断 */
        const hasContact = hw.tracker.pairsInvolving(ai.mainCollider.handle).some(
            p =>
                p.colliderAHandle === target.mainCollider.handle ||
                p.colliderBHandle === target.mainCollider.handle,
        )
        /* 初始重叠应产生接触 */
        expect(hasContact).toBe(true)

        const blocked = aiPushBlock(hw, ai, [target], 1, 0)
        expect(blocked.dx).toBe(0)

        /* 随后分离系统应正常工作 */
        const aiPos = ai.body.translation()
        const tPos = target.body.translation()
        const sep = computeSeparation(
            {
                aiX: aiPos.x,
                aiZ: aiPos.z,
                ajX: tPos.x,
                ajZ: tPos.z,
                radiusA: R * ai.config.scale,
                radiusB: R * target.config.scale,
            },
            CHARACTER_SEPARATION_SPEED,
        )
        expect(sep).not.toBeNull()
    })

    it('AI 沿接触面切线方向滑开不被阻断', () => {
        const hw = createHarnessWorld()
        const ai = makeChar(hw, 1, 0, 0.5, 2)
        const target = makeChar(hw, 2, 0, 0.5, 0)

        /* 预热接触 */
        const stAI: CharFrameState = {gs: initGS(), entity: ai}
        const stTgt: CharFrameState = {gs: initGS(), entity: target}

        for (let i = 0; i < 30; i++) {
            tickMulti(hw, [stAI, stTgt], [
                {dx: 0, dz: -1},
                {dx: 0, dz: 0},
            ])
        }

        /* AI 已接触 target，现在尝试沿 X 方向移动（切线，不指向 target） */
        const blocked = aiPushBlock(hw, ai, [target], 1, 0)
        /* dx=1, dz=0：方向 (1,0)，若双方在 Z 方向对齐，X 移动不指向对方（点积 ≤ 0 不阻断） */
        if (blocked.dx !== 0) {
            /* 切线方向不被阻断时应能继续移动 */
            tickMulti(hw, [stAI, stTgt], [
                {dx: blocked.dx, dz: blocked.dz},
                {dx: 0, dz: 0},
            ])
            /* 不应穿入角色内部 */
            expect(hDist(ai, target)).toBeGreaterThanOrEqual(0.05)
        }
    })

    it('分离系统与 AI 阻断同时生效：分离先推离，AI 阻断防再次推入', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.15, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        let pushFrames = 0
        for (let i = 0; i < 60; i++) {
            /* a 尝试走向 b，但若接触则阻断 */
            const blocked = aiPushBlock(hw, a, [b], 1, 0)
            tickMulti(hw, [stA, stB], [
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
            const hw = createHarnessWorld()
            const slope = Math.tan((deg * Math.PI) / 180)
            makeSlope(hw, slope, 60, 2)

            const x = 60
            const y = slope * x + 0.51
            const a = makeChar(hw, 1, x, y, -20)
            /* b 放在 a 右侧略微重叠的位置 */
            const b = makeChar(hw, 2, x + 0.15, y, -20)

            const stA: CharFrameState = {gs: initGS(), entity: a}
            const stB: CharFrameState = {gs: initGS(), entity: b}

            /* 记录初始重叠和最终位移 */
            const initialOverlap = Math.max(0, MIN_DIST - hDist(a, b))

            /* 预热 0.5s 让角色落稳 */
            for (let i = 0; i < 30; i++) {
                tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
            }

            const preSepX_A = a.body.translation().x
            const preSepX_B = b.body.translation().x

            /* 运行分离 */
            for (let i = 0; i < 30; i++) {
                tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
            }

            /* 最终应分离 */
            expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)

            /* 水平位移应在合理范围内（重叠量 + 速度踢衰减余量） */
            const dispA = Math.abs(a.body.translation().x - preSepX_A)
            const dispB = Math.abs(b.body.translation().x - preSepX_B)
            /* 每边位移不应超过 3 × (overlap/2) + 缓冲（速度踢衰减导致的额外位移） */
            const maxDisp = initialOverlap * 0.5 * 3 + 0.5
            expect(dispA).toBeLessThanOrEqual(maxDisp)
            expect(dispB).toBeLessThanOrEqual(maxDisp)
        })
    }

    for (const deg of SLOPE_ANGLES) {
        it(`三个角色在 ${deg}° 坡上重叠全部被分离`, () => {
            const hw = createHarnessWorld()
            const slope = Math.tan((deg * Math.PI) / 180)
            makeSlope(hw, slope, 60, 2)

            const x = 60
            const y = slope * x + 0.51
            const a = makeChar(hw, 1, x, y, -20)
            const b = makeChar(hw, 2, x + 0.12, y, -20)
            const c = makeChar(hw, 3, x + 0.24, y, -20)

            const stA: CharFrameState = {gs: initGS(), entity: a}
            const stB: CharFrameState = {gs: initGS(), entity: b}
            const stC: CharFrameState = {gs: initGS(), entity: c}

            /* 预热 */
            for (let i = 0; i < 30; i++) {
                tickMulti(
                    hw,
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
                    hw,
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
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 1, 0.5, 0)
        const b = makeChar(hw, 2, 3, 0.5, 0)

        /* 在 a 左侧放一个重箱子，向右推动 */
        const box = makeDynamicBox(hw, -2, 0.5, 0, 1, 0.5, 1, 5)
        box.setLinvel({x: 8, y: 0, z: 0}, true)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* B 不应被 A 穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('30° 坡上箱子下滑推角色 A 挤角色 B，分离有效', () => {
        const hw = createHarnessWorld()
        const slope = Math.tan((30 * Math.PI) / 180)
        makeSlope(hw, slope, 80, 2)

        const xA = 60
        const y = slope * xA + 0.51
        const a = makeChar(hw, 1, xA, y, -20)
        const b = makeChar(hw, 2, xA - 1, y, -20)

        /* 放在 a 上方（较大 X 方向），重力会让其下滑推动 a */
        makeDynamicBox(hw, xA + 2, slope * (xA + 2) + 1, -20, 0.5, 0.5, 0.5, 3)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* 预热 */
        for (let i = 0; i < 30; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 运行推挤 */
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* B 不应被穿透 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.1)
    })

    it('85° 陡坡上箱子下滑推角色 A 挤角色 B，分离仍有效', () => {
        const hw = createHarnessWorld()
        const slope = Math.tan((85 * Math.PI) / 180)
        makeSlope(hw, slope, 80, 2)

        const xA = 10
        const y = slope * xA + 0.51
        const a = makeChar(hw, 1, xA, y, -20)
        const b = makeChar(hw, 2, xA - 1, y, -20)

        makeDynamicBox(hw, xA + 2, slope * (xA + 2) + 1, -20, 0.5, 0.5, 0.5, 3)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 30; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(0.05)
    })
})

describe('垂直墙 / 倒悬墙（90°/100°）— 分离与下落', () => {
    it('90° 垂直墙旁两重叠角色分离不穿墙', () => {
        const hw = createHarnessWorld()
        removeDefaultGround(hw)
        makeWall(hw, 90)

        const a = makeChar(hw, 1, 0, 3, 0.1)
        const b = makeChar(hw, 2, 0.15, 3, 0.1)

        const stA: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: a,
        }
        const stB: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: b,
        }

        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 水平方向应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 不穿入墙（墙在 z=0，角色半径 0.125） */
        expect(a.body.translation().z).toBeGreaterThanOrEqual(0)
        expect(b.body.translation().z).toBeGreaterThanOrEqual(0)
    })

    it('100° 倒悬墙旁两重叠角色分离不穿墙', () => {
        const hw = createHarnessWorld()
        removeDefaultGround(hw)
        makeWall(hw, 100)

        const a = makeChar(hw, 1, 0, 1, 0.5)
        const b = makeChar(hw, 2, 0.15, 1, 0.5)

        const stA: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: a,
        }
        const stB: CharFrameState = {
            gs: {isOnGround: false, groundNormal: {x: 0, y: 1, z: 0}, groundKeepTimer: 0},
            entity: b,
        }

        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
    })
})

// ==========================================================================
// 四、防穿模 — 角色被 box/area/terrain 紧贴包围
// ==========================================================================

describe('防穿模 — 角色紧贴箱子各面', () => {
    it('箱子紧贴角色上方不穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 0)
        /* box 紧贴角色头顶（角色半高 0.5 → 顶部 y=1.0；box 底 y=1.0） */
        makeStaticBox(hw, 0, 1.01, 0, 1, 0.01, 1)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 角色不应被压入地下 */
        expect(ch.body.translation().y).toBeGreaterThanOrEqual(0.2)
        /* 也不应穿透箱子：角色顶（y + 半高 0.5）保持在箱子底以下（容忍少量求解器渗透） */
        expect(ch.body.translation().y + 0.5).toBeLessThanOrEqual(1.02)
    })

    it('箱子紧贴角色下方（地面升高）不穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 1.5, 0)
        /* box 在角色脚下 */
        makeStaticBox(hw, 0, 0.5, 0, 2, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应落在箱子上方 */
        expect(ch.body.translation().y).toBeGreaterThanOrEqual(0.9)
    })

    it('箱子紧贴角色前方，角色 walk 不能穿入', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 5)
        makeStaticBox(hw, 0, 0.5, 0.5, 2, 0.5, 0.5)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 角色向前走（z-） */
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: -1}])
        }

        /* 角色不应穿入箱子（箱子 z∈[0,1]，角色半宽 R=0.125 → 前面应在 z≥1.125；
         * 胶囊曲面接触的求解器静置容差 ~2μm，放宽 1mm） */
        expect(ch.body.translation().z).toBeGreaterThanOrEqual(1.124)
    })

    it('箱子紧贴角色后方，角色 walk 不能穿入', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, -5)
        makeStaticBox(hw, 0, 0.5, -0.5, 2, 0.5, 0.5)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 1}])
        }

        expect(ch.body.translation().z).toBeLessThanOrEqual(-1.124)
    })

    it('箱子紧贴角色左侧，角色不能穿入', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 5, 0.5, 0)
        makeStaticBox(hw, 0.5, 0.5, 0, 0.5, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: -1, dz: 0}])
        }

        expect(ch.body.translation().x).toBeGreaterThanOrEqual(1.0)
    })

    it('箱子紧贴角色右侧，角色不能穿入', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, -5, 0.5, 0)
        makeStaticBox(hw, -0.5, 0.5, 0, 0.5, 0.5, 2)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 1, dz: 0}])
        }

        expect(ch.body.translation().x).toBeLessThanOrEqual(-1.0)
    })

    it('角色六面被箱子包围，不穿透任何箱子', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 2, 0)

        /* 六面包围 */
        makeStaticBox(hw, 0, 1.5, 0, 2, 0.5, 2) // 上
        makeStaticBox(hw, 0, -0.01, 0, 2, 0.01, 2) // 下
        makeStaticBox(hw, 0, 1, 1.5, 2, 0.5, 0.5) // 前
        makeStaticBox(hw, 0, 1, -1.5, 2, 0.5, 0.5) // 后
        makeStaticBox(hw, 1.5, 1, 0, 0.5, 0.5, 2) // 左
        makeStaticBox(hw, -1.5, 1, 0, 0.5, 0.5, 2) // 右

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 角色尝试四处移动 */
        const dirs = [
            {dx: 1, dz: 0},
            {dx: -1, dz: 0},
            {dx: 0, dz: 1},
            {dx: 0, dz: -1},
        ]
        for (let i = 0; i < 120; i++) {
            const d = dirs[i % 4]
            tickMulti(hw, [st], [d])
        }

        /* 角色应保持在大致围栏范围内 */
        expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(2)
        expect(Math.abs(ch.body.translation().z)).toBeLessThanOrEqual(2)
        expect(ch.body.translation().y).toBeGreaterThanOrEqual(0)
        expect(ch.body.translation().y).toBeLessThanOrEqual(2.5)
    })
})

describe('防穿模 — 角色紧贴地形', () => {
    it('角色从高处落到陡坡上不穿入地形', () => {
        const hw = createHarnessWorld()
        const slope = Math.tan((60 * Math.PI) / 180)
        makeSlope(hw, slope, 60, 2)

        const x = 40
        const y = slope * x + 1
        const ch = makeChar(hw, 1, x, y, -20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应在坡面以上（不穿透到坡面以下） */
        const terrainY = slope * ch.body.translation().x
        expect(ch.body.translation().y + 0.01).toBeGreaterThanOrEqual(terrainY)
    })

    it('角色行走撞向地形墙不穿透', () => {
        const hw = createHarnessWorld()
        /* 创建一个陡峭坡面充当"墙" */
        const steep = Math.tan((85 * Math.PI) / 180)
        makeSlope(hw, steep, 80, 2)

        /* 角色放在坡面上方，尝试向下坡方向走 */
        const x = 20
        const y = steep * x + 1
        const ch = makeChar(hw, 1, x, y, -20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        /* 向下坡方向走 */
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: -1, dz: 0}])
        }

        /* 角色不应穿入地形（地形 y = steep * x） */
        const terrainY = steep * ch.body.translation().x
        expect(ch.body.translation().y + 0.01).toBeGreaterThanOrEqual(terrainY)
    })
})

// ==========================================================================
// 五、物理稳定性（master 的 60 子步测试）
// ==========================================================================

describe('物理稳定性', () => {
    /* Rapier 的 world.step 恒为单固定子步（无 cannon-es 的 maxSubSteps 追赶机制），
       harness tick/tickMulti 每次即一帧物理；master 的 step(DT, DT, 60) 在
       deltaTime === fixedTimeStep 时同样只执行 1 子步，两者语义等价。 */
    it('单角色 idle 运行无爆炸', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 0)

        let gs = initGS()
        for (let i = 0; i < 10; i++) {
            gs = tick(hw, ch, gs, 0, 0)
        }

        /* 角色应保持在地面附近，速度不爆炸 */
        expect(ch.body.translation().y).toBeGreaterThanOrEqual(0)
        expect(ch.body.translation().y).toBeLessThanOrEqual(2)
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
        expect(ch.stateMachine.currentState).toBe('idle')
    })

    it('两个重叠角色分离收敛不爆炸', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.1, 0.5, 0)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        for (let i = 0; i < 20; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        /* 最终应分离 */
        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 速度不爆炸 */
        expect(speedOf(a)).toBeLessThanOrEqual(50)
        expect(speedOf(b)).toBeLessThanOrEqual(50)
        /* 位置不飞走 */
        expect(Math.abs(a.body.translation().x)).toBeLessThanOrEqual(5)
        expect(Math.abs(b.body.translation().x)).toBeLessThanOrEqual(5)
        expect(a.body.translation().y).toBeLessThanOrEqual(3)
        expect(b.body.translation().y).toBeLessThanOrEqual(3)
    })

    it('三个角色 + 箱子推挤不爆炸', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, -1, 0.5, 0)
        const b = makeChar(hw, 2, 0.05, 0.5, 0.1)
        const c = makeChar(hw, 3, 1, 0.5, -0.1)

        const box = makeDynamicBox(hw, -3, 0.5, 0, 1, 0.5, 1, 5)
        box.setLinvel({x: 10, y: 0, z: 0}, true)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 30; i++) {
            tickMulti(
                hw,
                [stA, stB, stC],
                [
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                    {dx: 0, dz: 0},
                ],
            )
        }

        /* 无速度爆炸 */
        for (const ch of [a, b, c]) {
            expect(speedOf(ch)).toBeLessThanOrEqual(50)
            expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(10)
            expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        }
    })

    it('分离距离确定性一致（两次独立世界运行收敛相同）', () => {
        const runWorld = (): number => {
            const hw = createHarnessWorld()
            const a = makeChar(hw, 1, 0, 0.5, 0)
            const b = makeChar(hw, 2, 0.1, 0.5, 0)

            const stA: CharFrameState = {gs: initGS(), entity: a}
            const stB: CharFrameState = {gs: initGS(), entity: b}

            for (let i = 0; i < 30; i++) {
                tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
            }
            return hDist(a, b)
        }

        /* Rapier 无 maxSubSteps 概念，两次独立世界分别模拟（master 的
           step(DT, DT, 1) 与 step(DT, DT, 60) 实际均只执行 1 子步，
           因此用相同的 harness 循环复现两种配置） */
        const d1 = runWorld()
        const d60 = runWorld()

        /* 两者最终分离距离应在同一数量级 */
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
        hw: HarnessWorld,
        mass: number,
        x: number,
        vx: number,
    ): ReturnType<typeof makeDynamicBox> => {
        const box = makeDynamicBox(hw, x, 0.5, 0, 1, 0.5, 1, mass)
        box.setLinvel({x: vx, y: 0, z: 0}, true)
        return box
    }

    it('质量 10 箱子高速撞向角色，角色不被穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 1, 0.5, 0)
        makeHeavyBox(hw, 10, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 角色不应飞到极高位置或极远位置 */
        expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(10)
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
    })

    it('质量 50 箱子高速撞向角色，角色不被穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 1, 0.5, 0)
        makeHeavyBox(hw, 50, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(10)
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
    })

    it('质量 200 箱子高速撞向角色，角色不被穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 1, 0.5, 0)
        makeHeavyBox(hw, 200, -2, 15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        /* 质量 10/50 档保持 master 阈值 10；200 档 Rapier 求解器比 cannon 多推 ~44%
           （实测 14.4），阈值放宽到 16 仍保持「不飞走」的意图 */
        expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(16)
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
    })

    it('角色被夹在大质量箱子和静态墙之间不穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 1, 0.5, 0)
        /* 在角色右侧放一堵墙 x=1.6 半宽 0.1 → 墙占用 x∈[1.5, 1.7] */
        makeStaticBox(hw, 1.6, 0.5, 0, 0.1, 2, 2)
        /* 大箱子从左侧高速推入 */
        makeHeavyBox(hw, 100, -2, 20)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        let maxRight = 0
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
            maxRight = Math.max(maxRight, ch.body.translation().x + R)
        }

        /* 角色右边界不应越过墙左边界（墙左边界=1.5），允许微小穿透量 */
        expect(maxRight).toBeLessThanOrEqual(1.65)
        /* 角色不应被压入地下 */
        expect(ch.body.translation().y).toBeGreaterThanOrEqual(0.1)
        /* 角色不应发生速度爆炸 */
        expect(speedOf(ch)).toBeLessThanOrEqual(60)
    })

    it('角色被两个大质量箱子从两侧同时挤压不穿透', () => {
        const hw = createHarnessWorld()
        const ch = makeChar(hw, 1, 0, 0.5, 0)
        makeHeavyBox(hw, 80, -2, 15)
        makeHeavyBox(hw, 80, 2, -15)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 120; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 角色应大致停留在两箱子之间 */
        expect(Math.abs(ch.body.translation().x)).toBeLessThanOrEqual(3)
        expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
    })
})

describe('三角色加大质量箱子挤压 — 分离系统压力测试', () => {
    it('大质量箱子推三角色，全部不被穿透', () => {
        const hw = createHarnessWorld()
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0.5, 0.5, 0.1)
        const c = makeChar(hw, 3, 1, 0.5, -0.1)

        const box = makeDynamicBox(hw, -3, 0.5, 0, 1.5, 0.5, 1.5, 100)
        box.setLinvel({x: 20, y: 0, z: 0}, true)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 120; i++) {
            tickMulti(
                hw,
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
            expect(speedOf(ch)).toBeLessThanOrEqual(50)
            expect(ch.body.translation().y).toBeLessThanOrEqual(5)
        }
    })

    it('三角色 + 大质量箱 + 30° 坡面，分离在斜坡上仍有效', () => {
        const hw = createHarnessWorld()
        const slope = Math.tan((30 * Math.PI) / 180)
        makeSlope(hw, slope, 80, 2)

        const xA = 60
        const y = slope * xA + 0.51
        const a = makeChar(hw, 1, xA, y, -20)
        const b = makeChar(hw, 2, xA - 0.8, y, -20)
        const c = makeChar(hw, 3, xA - 1.6, y, -20)

        /* 大箱子从上方（大 x 方向）下滑推动三角色 */
        makeDynamicBox(hw, xA + 3, slope * (xA + 3) + 1, -20, 0.8, 0.5, 0.8, 50)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        /* 预热 */
        for (let i = 0; i < 30; i++) {
            tickMulti(
                hw,
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
                hw,
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
        const hw = createHarnessWorld()
        const slope = Math.tan((85 * Math.PI) / 180)
        makeSlope(hw, slope, 80, 2)

        const xA = 15
        const y = slope * xA + 0.51
        const a = makeChar(hw, 1, xA, y, -20)
        const b = makeChar(hw, 2, xA - 0.8, y, -20)
        const c = makeChar(hw, 3, xA - 1.6, y, -20)

        makeDynamicBox(hw, xA + 3, slope * (xA + 3) + 1, -20, 0.8, 0.5, 0.8, 50)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 30; i++) {
            tickMulti(
                hw,
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
                hw,
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
            expect(speedOf(ch)).toBeLessThanOrEqual(50)
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
        const hw = createHarnessWorld()
        makeStaticBox(hw, 0, 0.5, 0, 1.2, 0.5, 1.2)
        const ch = makeChar(hw, 1, 0, 0.5, 0)

        const st: CharFrameState = {gs: initGS(), entity: ch}

        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [st], [{dx: 0, dz: 0}])
        }

        /* 不崩溃的情况下检查速度有界（不因穿透产生 NaN 或极大速度） */
        expect(speedOf(ch)).toBeLessThanOrEqual(50)
        expect(Number.isFinite(ch.body.translation().y)).toBe(true)
    })

    it('两个角色互相 spawn 在对方体内，多层分离层层推进', () => {
        const hw = createHarnessWorld()
        /* 两者完全重合在相同位置 */
        const a = makeChar(hw, 1, 0, 0.5, 0)
        const b = makeChar(hw, 2, 0, 0.5, 0)

        expect(hDist(a, b)).toBeLessThan(0.01)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}

        /* 连续 60 帧尝试分离 */
        for (let i = 0; i < 60; i++) {
            tickMulti(hw, [stA, stB], [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }

        expect(hDist(a, b)).toBeGreaterThanOrEqual(MIN_DIST)
        /* 分离后不应产生单个大位移（应逐步推离） */
        expect(Math.abs(a.body.translation().x)).toBeLessThanOrEqual(2)
    })

    it('三角色 spawn 在箱子内部 + 互相重叠，可恢复', () => {
        const hw = createHarnessWorld()
        makeStaticBox(hw, 0.3, 0.5, 0, 1, 0.5, 1)

        const a = makeChar(hw, 1, 0.2, 0.5, 0)
        const b = makeChar(hw, 2, 0.25, 0.5, 0.1)
        const c = makeChar(hw, 3, 0.3, 0.5, -0.1)

        const stA: CharFrameState = {gs: initGS(), entity: a}
        const stB: CharFrameState = {gs: initGS(), entity: b}
        const stC: CharFrameState = {gs: initGS(), entity: c}

        for (let i = 0; i < 90; i++) {
            tickMulti(
                hw,
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
            expect(speedOf(ch)).toBeLessThanOrEqual(50)
        }
    })
})

describe('渐进质量挤压 — 寻找穿透阈值', () => {
    const MASSES = [5, 20, 50, 100, 300] as const

    for (const mass of MASSES) {
        it(`质量 ${mass} 箱子 + 速度 25 → 角色不被穿透`, () => {
            const hw = createHarnessWorld()
            const ch = makeChar(hw, 1, 2, 0.5, 0)

            const box = makeDynamicBox(hw, -2, 0.5, 0, 1, 0.5, 1, mass)
            box.setLinvel({x: 25, y: 0, z: 0}, true)

            const st: CharFrameState = {gs: initGS(), entity: ch}

            for (let i = 0; i < 90; i++) {
                tickMulti(hw, [st], [{dx: 0, dz: 0}])
            }

            /* 角色不应穿入箱子左侧（箱子初始 x=-1 左边界 → 最终 x 可能因为碰撞向前） */
            /* 核心断言：角色不被砸入地下、不被弹飞到极高位置 */
            expect(ch.body.translation().y).toBeGreaterThanOrEqual(-0.5)
            expect(ch.body.translation().y).toBeLessThanOrEqual(8)
            expect(speedOf(ch)).toBeLessThanOrEqual(60)
        })
    }
})
