import {describe, it, expect, beforeAll} from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import {sampleOverlap} from './overlap.ts'
import type {AreaShape} from '../types/index.ts'

const ORIGIN = {x: 0, y: 0, z: 0}
const IDENTITY = {x: 0, y: 0, z: 0, w: 1}

let world: RAPIER.World

beforeAll(async () => {
    await RAPIER.init()
    world = new RAPIER.World({x: 0, y: -9.82, z: 0})
})

const makeBoxBody = (hx: number, hy: number, hz: number, x = 0, y = 0, z = 0): RAPIER.RigidBody => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)
    return body
}

const BOX_1: AreaShape = {kind: 'box', width: 1, height: 1, depth: 1}

describe('sampleOverlap — 盒体区域', () => {
    it('完全包含 → 重叠体积 = 刚体体积，浸没比例 = 1', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5)
        const r = sampleOverlap(body, BOX_1, ORIGIN, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo(1, 5)
        expect(r!.fraction).toBeCloseTo(1, 5)
    })

    it('无重叠 → undefined', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5, 10, 0, 0)
        expect(sampleOverlap(body, BOX_1, ORIGIN, IDENTITY)).toBeUndefined()
    })

    it('部分重叠 → 体积与浸没比例均在 (0,1)', () => {
        /* 刚体沿 X 偏移 0.75：一半在内（重叠 0.25 / 1） */
        const body = makeBoxBody(0.5, 0.5, 0.5, 0.75, 0, 0)
        const r = sampleOverlap(body, BOX_1, ORIGIN, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeGreaterThan(0)
        expect(r!.volume).toBeLessThan(1)
        expect(r!.fraction).toBeGreaterThan(0)
        expect(r!.fraction).toBeLessThan(1)
    })

    it('旋转 90° 区域下的轴对齐刚体仍能重叠', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5)
        const q = {x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2}
        const r = sampleOverlap(body, BOX_1, ORIGIN, q)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo(1, 5)
    })
})

describe('sampleOverlap — 球形区域', () => {
    it('球完全在立方体内 → 体积 = 球体积', () => {
        /* 半径 0.5 的球完全落在半尺寸 0.5 的立方体内 */
        const body = makeBoxBody(0.5, 0.5, 0.5)
        const shape: AreaShape = {kind: 'sphere', radius: 0.5}
        const r = sampleOverlap(body, shape, ORIGIN, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo((4 / 3) * Math.PI * 0.125, 2)
    })

    it('大球完全包含立方体 → 体积 = 立方体体积', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5)
        const shape: AreaShape = {kind: 'sphere', radius: 5}
        const r = sampleOverlap(body, shape, ORIGIN, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo(1, 2)
        expect(r!.fraction).toBeCloseTo(1, 2)
    })

    it('球完全在立方体外 → undefined', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5, 10, 0, 0)
        const shape: AreaShape = {kind: 'sphere', radius: 0.5}
        expect(sampleOverlap(body, shape, ORIGIN, IDENTITY)).toBeUndefined()
    })
})

describe('sampleOverlap — 柱形区域（轴向局部 +Y）', () => {
    it('半径覆盖截面且高度覆盖 → 体积 = 圆盘面积 × 高度', () => {
        /* 柱 r=0.5，高 1：截面 πr² 完全在立方体内，高度重叠 1 */
        const body = makeBoxBody(0.5, 0.5, 0.5)
        const shape: AreaShape = {kind: 'cylinder', radius: 0.5, height: 1}
        const r = sampleOverlap(body, shape, ORIGIN, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo(Math.PI * 0.25 * 1, 4)
    })

    it('高度只覆盖一半 → 体积减半', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5)
        /* 柱中心上移 0.5：只与刚体下半 [-0.5, 0] 相交（重叠高度 0.5） */
        const shape: AreaShape = {kind: 'cylinder', radius: 0.5, height: 1}
        const r = sampleOverlap(body, shape, {x: 0, y: 0.5, z: 0}, IDENTITY)
        expect(r).toBeDefined()
        expect(r!.volume).toBeCloseTo(Math.PI * 0.25 * 0.5, 4)
    })

    it('完全在柱外 → undefined', () => {
        const body = makeBoxBody(0.5, 0.5, 0.5, 10, 0, 0)
        const shape: AreaShape = {kind: 'cylinder', radius: 0.5, height: 1}
        expect(sampleOverlap(body, shape, ORIGIN, IDENTITY)).toBeUndefined()
    })
})
