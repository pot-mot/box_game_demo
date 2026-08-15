import {beforeAll, describe, it, expect} from 'vitest'
import {createHarnessWorld, initRapier, makeSlope, makeChar, tick, tickMulti, initGS, type CharFrameState} from './harness.ts'
import type {GroundState} from './ground_state.ts'

const FRAMES_2S = 120

beforeAll(async () => {
    await initRapier()
})

describe('斜坡静止（防滑）', () => {
    it('30° 坡 idle 静止 2s 不下滑', () => {
        const hw = createHarnessWorld()
        makeSlope(hw, Math.tan(Math.PI / 6))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 6) * x + 1
        const entity = makeChar(hw, 1, x, y, z)

        let gs: GroundState = initGS()
        /* 预热 1s：角色落稳坡面（落地冲击位移不计入防滑判定） */
        for (let i = 0; i < 60; i++) gs = tick(hw, entity, gs, 0, 0)
        const p0 = entity.body.translation()
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(hw, entity, gs, 0, 0)
        const p1 = entity.body.translation()

        expect(Math.abs(p1.x - p0.x)).toBeLessThan(0.05)
        expect(Math.abs(p1.z - p0.z)).toBeLessThan(0.05)
        expect(entity.stateMachine.currentState).toBe('idle')
    })

    it('45° 坡 idle 静止 2s 不下滑', () => {
        const hw = createHarnessWorld()
        makeSlope(hw, Math.tan(Math.PI / 4))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 4) * x + 1
        const entity = makeChar(hw, 1, x, y, z)

        let gs: GroundState = initGS()
        /* 预热 1s：角色落稳坡面（落地冲击位移不计入防滑判定） */
        for (let i = 0; i < 60; i++) gs = tick(hw, entity, gs, 0, 0)
        const p0 = entity.body.translation()
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(hw, entity, gs, 0, 0)
        const p1 = entity.body.translation()

        expect(Math.abs(p1.x - p0.x)).toBeLessThan(0.05)
        expect(Math.abs(p1.z - p0.z)).toBeLessThan(0.05)
        expect(entity.stateMachine.currentState).toBe('idle')
    })
})

describe('斜坡下坡行走', () => {
    it('30° 坡下坡行走 2s 无状态抖动且速度有界', () => {
        const hw = createHarnessWorld()
        makeSlope(hw, Math.tan(Math.PI / 6))
        const x = 20
        const z = -20
        const y = Math.tan(Math.PI / 6) * x + 1
        const entity = makeChar(hw, 1, x, y, z)

        let gs: GroundState = initGS()
        /* 预热 0.5s：让角色落稳坡面（不计切换） */
        for (let i = 0; i < 30; i++) gs = tick(hw, entity, gs, -1, 0)
        let prev = entity.stateMachine.currentState
        let flips = 0
        for (let i = 0; i < FRAMES_2S; i++) {
            gs = tick(hw, entity, gs, -1, 0)
            if (entity.stateMachine.currentState !== prev) {
                flips++
                prev = entity.stateMachine.currentState
            }
        }

        expect(flips).toBeLessThanOrEqual(2)
        const linvel = entity.body.linvel()
        expect(Math.hypot(linvel.x, linvel.y, linvel.z)).toBeLessThanOrEqual(12.1)
        expect(entity.body.translation().x).toBeLessThan(x)
    })
})

describe('陡坡下滑（预期行为）', () => {
    it('88° 坡 idle 2s 进入 falling 且速度有界、位置下降', () => {
        const hw = createHarnessWorld()
        makeSlope(hw, Math.tan(Math.PI * 88 / 180))
        const x = 10
        const z = -20
        const y = Math.tan(Math.PI * 88 / 180) * x + 1
        const entity = makeChar(hw, 1, x, y, z)

        let gs: GroundState = initGS()
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(hw, entity, gs, 0, 0)

        expect(entity.stateMachine.currentState).toBe('falling')
        const linvel = entity.body.linvel()
        expect(Math.hypot(linvel.x, linvel.y, linvel.z)).toBeLessThanOrEqual(12.1)
        expect(entity.body.translation().y).toBeLessThan(y - 0.5)
    })
})

describe('平地回归', () => {
    it('平地行走 2s 速度接近配置速度（摩擦回归保护）', () => {
        const hw = createHarnessWorld()
        const entity = makeChar(hw, 1, 0, 0.5, 0)

        let gs: GroundState = initGS()
        for (let i = 0; i < FRAMES_2S; i++) gs = tick(hw, entity, gs, 1, 0)

        expect(entity.body.translation().x).toBeGreaterThan(11)
    })
})

describe('斜坡上的角色强制分离', () => {
    it('45° 坡上重叠分离沿坡面推开，水平位移带 Y 补偿不埋入坡面（穿模回归）', () => {
        const hw = createHarnessWorld()
        makeSlope(hw, Math.tan(Math.PI / 4))
        /* 坡面沿 +X 上升（y ≈ x），两角色先分开落稳坡面 */
        const a = makeChar(hw, 1, 20, 20.8, -16)
        const b = makeChar(hw, 2, 22, 22.8, -16)
        const states: CharFrameState[] = [
            {gs: initGS(), entity: a},
            {gs: initGS(), entity: b},
        ]

        /* 落稳：直到两者都贴坡（坡面法线 ny ≈ cos45°） */
        for (let i = 0; i < 120; i++) {
            tickMulti(hw, states, [{dx: 0, dz: 0}, {dx: 0, dz: 0}])
        }
        expect(a.isOnGround).toBe(true)
        expect(b.isOnGround).toBe(true)
        expect(a.groundNormal.y).toBeGreaterThan(0.5)

        /* 记录贴坡基线（y − x 应保持恒定） */
        const pa = a.body.translation()
        const pb = b.body.translation()
        const baseA = pa.y - pa.x
        const baseB = pb.y - pb.x

        /* 把 B 传送到 A 旁边制造水平重叠（沿上坡方向偏移 0.08 < 最小间距 0.25，
         * Y 按 A 的贴坡高度 + 坡面抬升 0.08，保持贴坡） */
        b.body.setTranslation({x: pa.x + 0.08, y: pa.y + 0.08, z: pa.z}, true)

        /* 单帧：物理步进产生接触 → 分离触发（水平位移 + 坡面 Y 补偿） */
        tickMulti(hw, states, [{dx: 0, dz: 0}, {dx: 0, dz: 0}])

        const pa2 = a.body.translation()
        const pb2 = b.body.translation()
        /* 已被推开到最小间距之外 */
        expect(Math.hypot(pa2.x - pb2.x, pa2.z - pb2.z)).toBeGreaterThanOrEqual(0.24)
        /* 关键回归点：分离后仍贴坡（y−x 与基线一致），未因纯水平瞬移陷入/浮离坡面 */
        expect(Math.abs((pa2.y - pa2.x) - baseA)).toBeLessThan(0.05)
        expect(Math.abs((pb2.y - pb2.x) - baseB)).toBeLessThan(0.05)
    })
})
