import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createBodyEnvironment, type BodyEnvironment} from '../../../../physics/environment.ts'
import {GRAVITY} from '../../../../physics/constants.ts'
import {applyFloat} from './float.ts'
import {applyWind} from './wind.ts'
import {applyGravity} from './gravity.ts'
import {applyFields} from './index.ts'
import type {AreaFieldContext} from './types.ts'
import type {OverlapResult} from '../overlap.ts'
import type {AreaConfig} from '../../types/index.ts'

const ORIGIN = {x: 0, y: 0, z: 0}
const IDQ = {x: 0, y: 0, z: 0, w: 1}

interface MockBody {
    forces: Array<{x: number; y: number; z: number}>
    addForce: (f: {x: number; y: number; z: number}, wake?: boolean) => void
    linvel: () => {x: number; y: number; z: number}
    angvel: () => {x: number; y: number; z: number}
    setAngvel: (v: {x: number; y: number; z: number}, wake?: boolean) => void
    mass: () => number
    translation: () => {x: number; y: number; z: number}
}

const makeBody = (mass = 1, vel = {x: 0, y: 0, z: 0}): MockBody => {
    const forces: Array<{x: number; y: number; z: number}> = []
    return {
        forces,
        addForce: (f) => { forces.push({x: f.x, y: f.y, z: f.z}) },
        linvel: () => vel,
        angvel: () => ({x: 0, y: 0, z: 0}),
        setAngvel: () => {},
        mass: () => mass,
        translation: () => ({x: 0, y: 0, z: 0}),
    }
}

const makeCtx = (body: MockBody, overlap: OverlapResult, env?: BodyEnvironment): AreaFieldContext => ({
    body: body as unknown as RAPIER.RigidBody,
    overlap,
    areaPos: ORIGIN,
    areaQuat: IDQ,
    env,
})

const overlapOf = (volume: number, fraction: number): OverlapResult => ({volume, fraction})

describe('浮力场 float', () => {
    it('普通刚体：施加沿局部 +Y 的浮力 = 密度 × |g| × 体积', () => {
        const body = makeBody(1)
        applyFloat(makeCtx(body, overlapOf(0.5, 0.5)), {density: 2, drag: 4})
        const buoy = body.forces[0]
        expect(buoy.y).toBeCloseTo(2 * Math.abs(GRAVITY) * 0.5, 5)
    })

    it('角色环境：写入浮力加速度 + 拖拽速率 + 浸没比例', () => {
        const env = createBodyEnvironment()
        applyFloat(makeCtx(makeBody(1), overlapOf(0.5, 0.5), env), {density: 2, drag: 4})
        expect(env.accel.y).toBeCloseTo(2 * Math.abs(GRAVITY) * 0.5, 5)
        expect(env.flowBlend).toBe(4)
        expect(env.fluidFraction).toBe(0.5)
    })

    it('零体积：无任何效果', () => {
        const body = makeBody(1)
        applyFloat(makeCtx(body, overlapOf(0, 0)), {density: 2, drag: 4})
        expect(body.forces).toHaveLength(0)
    })
})

describe('风场 wind', () => {
    it('普通刚体：力 = drag × 质量 × (目标流速 − 速度) × 浸没比例', () => {
        const body = makeBody(2)
        applyWind(makeCtx(body, overlapOf(0.5, 0.5)), {speed: 8, dirX: 1, dirY: 0, dirZ: 0, drag: 3})
        const f = body.forces[0]
        expect(f.x).toBeCloseTo(3 * 2 * (8 - 0) * 0.5, 5)
        expect(f.y).toBeCloseTo(0, 5)
    })

    it('角色环境：写入流速目标 + 混合速率', () => {
        const env = createBodyEnvironment()
        applyWind(makeCtx(makeBody(1), overlapOf(0.5, 0.5), env), {speed: 8, dirX: 1, dirY: 0, dirZ: 0, drag: 3})
        expect(env.flow.x).toBeCloseTo(8, 5)
        expect(env.flowBlend).toBeCloseTo(3 * 0.5, 5)
    })

    it('零方向：无效果', () => {
        const body = makeBody(1)
        applyWind(makeCtx(body, overlapOf(0.5, 0.5)), {speed: 8, dirX: 0, dirY: 0, dirZ: 0, drag: 3})
        expect(body.forces).toHaveLength(0)
    })
})

describe('方向重力场 gravity', () => {
    it('普通刚体：补差值 = 区域重力 − 全局重力', () => {
        const body = makeBody(1)
        applyGravity(makeCtx(body, overlapOf(1, 1)), {accelX: 0, accelY: -20, accelZ: 0})
        expect(body.forces[0].y).toBeCloseTo(-20 - GRAVITY, 5)
    })

    it('角色环境：写入加速度增量', () => {
        const env = createBodyEnvironment()
        applyGravity(makeCtx(makeBody(1), overlapOf(1, 1), env), {accelX: 0, accelY: -20, accelZ: 0})
        expect(env.accel.y).toBeCloseTo(-20 - GRAVITY, 5)
    })

    it('无重叠：无效果', () => {
        const body = makeBody(1)
        applyGravity(makeCtx(body, overlapOf(0, 0)), {accelX: 0, accelY: -20, accelZ: 0})
        expect(body.forces).toHaveLength(0)
    })
})

describe('applyFields 分派', () => {
    it('按启用场依次施加（浮力 + 风 + 重力可叠加）', () => {
        const config: AreaConfig = {
            shape: {kind: 'box', width: 2, height: 2, depth: 2},
            material: 'water',
            fields: {
                float: {density: 2, drag: 4},
                wind: {speed: 8, dirX: 1, dirY: 0, dirZ: 0, drag: 3},
                gravity: {accelX: 0, accelY: -20, accelZ: 0},
            },
        }
        const env = createBodyEnvironment()
        applyFields(makeCtx(makeBody(1), overlapOf(1, 1), env), config)
        /* 浮力 +Y，风 +X，重力补 -20−g 的 Y 增量 */
        expect(env.accel.y).toBeCloseTo(2 * Math.abs(GRAVITY) + (-20 - GRAVITY), 5)
        expect(env.flow.x).toBeCloseTo(8, 5)
        expect(env.flowBlend).toBeCloseTo(4, 5)
    })
})
